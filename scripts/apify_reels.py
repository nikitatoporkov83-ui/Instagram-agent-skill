#!/usr/bin/env python3
"""Collect bounded hashtag candidates or resume an existing Apify run/dataset.

Credentials are read only from APIFY_API_TOKEN. No token values are printed,
accepted as CLI arguments, written to disk, or sent to a host other than Apify.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
API = "https://api.apify.com/v2/"
ACTOR = "apify~instagram-hashtag-scraper"
ID = re.compile(r"[A-Za-z0-9_-]{1,80}\Z")


class ApifyError(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Client:
    def __init__(self, token):
        self.token = token
        self.opener = build_opener(NoRedirect)

    def request(self, path, data=None):
        # All paths are constructed from validated IDs, not user-provided URLs.
        request = Request(API + path,
                          data=json.dumps(data).encode() if data is not None else None,
                          headers={"Authorization": "Bearer " + self.token,
                                   "Accept": "application/json", "Content-Type": "application/json"},
                          method="POST" if data is not None else "GET")
        try:
            with self.opener.open(request, timeout=25) as response:
                raw = response.read(8 * 1024 * 1024 + 1)
            if len(raw) > 8 * 1024 * 1024:
                raise ApifyError("Ответ слишком большой. Используйте меньший Dataset.")
            return json.loads(raw)
        except HTTPError as error:
            # Upstream error bodies may contain credentials; never echo them.
            raise ApifyError(f"Apify вернул HTTP {error.code}. Проверьте доступ и состояние запуска в Console.") from None
        except (URLError, TimeoutError, OSError):
            if data is not None:
                raise ApifyError("Ответ на запуск не получен. Не запускайте повторно: проверьте Runs в Apify и продолжите с --run ID.") from None
            raise ApifyError("Нет ответа Apify. Проверьте доступ к api.apify.com и защищённый APIFY_API_TOKEN.") from None
        except (ValueError, UnicodeError):
            raise ApifyError("Apify вернул некорректный JSON.") from None


def start_run(client, hashtag, count):
    limit = min(100, max(count * 4, count))
    query = urlencode({"timeout": 300, "maxItems": limit,
                       "maxTotalChargeUsd": 1, "memory": 512})
    # Starting is deliberately explicit. A lost POST response is never retried.
    result = client.request(f"acts/{ACTOR}/runs?{query}",
                            {"hashtags": [hashtag], "resultsLimit": limit})
    run = result.get("data", {})
    if not ID.fullmatch(str(run.get("id", ""))):
        raise ApifyError("Apify не подтвердил ID запуска. Проверьте Runs перед повторной попыткой.")
    return run


def await_run(client, run_id, wait_seconds=360):
    if not ID.fullmatch(run_id):
        raise ApifyError("Некорректный ID Run.")
    deadline = time.monotonic() + wait_seconds
    while True:
        run = client.request("actor-runs/" + run_id).get("data", {})
        status = run.get("status")
        if status == "SUCCEEDED":
            dataset = str(run.get("defaultDatasetId", ""))
            if not ID.fullmatch(dataset):
                raise ApifyError("Завершённый запуск не передал Dataset ID.")
            return dataset
        if status in ("FAILED", "ABORTED", "TIMED-OUT"):
            raise ApifyError(f"Сбор закончился со статусом {status}. Подробности доступны в Apify Console.")
        if time.monotonic() >= deadline:
            raise ApifyError(f"Запуск ещё выполняется. Продолжите без повторного запуска: --run {run_id}")
        time.sleep(5)


def save_candidates(client, dataset, folder, requested_count=20):
    if not ID.fullmatch(dataset):
        raise ApifyError("Некорректный Dataset ID.")
    raw = client.request("datasets/" + dataset + "/items?clean=true&format=json&limit=100")
    if not isinstance(raw, list):
        raise ApifyError("Dataset не вернул список записей.")
    try:
        prepared = subprocess.run(["node", str(ROOT / "scripts/prepare_apify_reels.cjs")],
                                  input=json.dumps({"items": raw}), text=True,
                                  capture_output=True, timeout=20, cwd=ROOT)
    except (OSError, subprocess.TimeoutExpired):
        raise ApifyError("Не удалось запустить локальную обработку. Нужен Node.js 22+.") from None
    if prepared.returncode:
        raise ApifyError("Не удалось подготовить результаты. Проверьте формат выгрузки Instagram.")
    result = json.loads(prepared.stdout)
    # Never save the raw provider response: keep only allowlisted Reel fields.
    folder.mkdir(parents=True, exist_ok=True)
    output = folder / (folder.name + "-candidates.json")
    output.write_text(json.dumps(result["rows"], ensure_ascii=False, indent=2) + "\n")
    (folder / "source.json").write_text(json.dumps({"datasetId": dataset, "requested": requested_count,
                                                    "videoHooksReviewed": False}, indent=2) + "\n")
    return output, len(result["rows"])


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--start", action="store_true", help="Явно запустить сбор #gta6 в Apify.")
    mode.add_argument("--run", help="Продолжить существующий запуск, не создавая новый.")
    mode.add_argument("--dataset", help="Получить готовый Dataset без запуска Actor.")
    parser.add_argument("--hashtag", default="gta6")
    parser.add_argument("--count", type=int, default=20)
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[A-Za-z0-9_]{1,80}", args.hashtag) or not 1 <= args.count <= 25:
        parser.error("Укажите хэштег без # и количество от 1 до 25.")
    if not any((args.start, args.run, args.dataset)):
        print("Готово к сбору: #" + args.hashtag + f", цель {args.count} Reels. Для старта: --start; для готовых данных: --dataset ID.")
        return 0
    token = os.environ.get("APIFY_API_TOKEN")
    if not token:
        print("APIFY_API_TOKEN не настроен. Добавьте новый токен в защищённые настройки среды, не в командную строку.", file=sys.stderr)
        return 2
    try:
        client = Client(token)
        folder = ROOT / ".instagram" / "research" / args.hashtag
        dataset = args.dataset
        if args.start:
            run = start_run(client, args.hashtag, args.count)
            folder.mkdir(parents=True, exist_ok=True)
            (folder / "active-run.json").write_text(json.dumps({"runId": run["id"], "hashtag": args.hashtag}) + "\n")
            print("Создан запуск: " + run["id"], flush=True)
            dataset = await_run(client, run["id"])
        elif args.run:
            dataset = await_run(client, args.run)
        output, count = save_candidates(client, dataset, folder, args.count)
        print(f"Получено кандидатов: {count}. Файл: {output.relative_to(ROOT)}")
        print("Это кандидаты по подписи и метрикам. Посмотрите первые секунды видео перед утверждением финальных 20.")
        return 0
    except ApifyError as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
