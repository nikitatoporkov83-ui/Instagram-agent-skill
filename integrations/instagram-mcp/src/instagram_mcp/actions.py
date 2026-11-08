"""Persistent, account-bound review and single-execution journal for MCP writes."""
from __future__ import annotations

import hashlib
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import secrets
import sqlite3
import time
from typing import Any

from .russian import STATUS


class ActionError(ValueError):
    pass


class Journal:
    def __init__(self, directory: str | Path):
        folder = Path(directory)
        folder.mkdir(parents=True,exist_ok=True,mode=0o700)
        self.path = folder / 'actions.sqlite3'
        with self.db() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS actions (
                id TEXT PRIMARY KEY, code_hash TEXT NOT NULL, tool TEXT NOT NULL,
                arguments TEXT NOT NULL, account_id TEXT NOT NULL, username TEXT NOT NULL,
                status TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL, result TEXT)''')
            db.execute('DELETE FROM actions WHERE created_at<?',(int(time.time())-30*86400,))
            db.execute("UPDATE actions SET status='uncertain',updated_at=? WHERE status='running' AND updated_at<?",(int(time.time()),int(time.time())-900))
        self.path.chmod(0o600)

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path,timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def prepare(self, tool: str, arguments: dict, account: dict) -> dict:
        ident, code, now = secrets.token_urlsafe(24), secrets.token_urlsafe(32), int(time.time())
        with self.db() as db:
            db.execute('INSERT INTO actions VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                       (ident,hashlib.sha256(code.encode()).hexdigest(),tool,
                        json.dumps(arguments,ensure_ascii=False),str(account['id']),account['username'],
                        'prepared',now,now+600,now,None))
        return {**self.get(ident),'confirmation_code':code,'requires_confirmation':True,
                'message':'Действие подготовлено. Покажите владельцу аккаунт и материал или точный текст. Дождитесь его согласия перед confirm_action.'}

    def row(self, ident: str):
        with self.db() as db:
            row = db.execute('SELECT * FROM actions WHERE id=?',(ident,)).fetchone()
        if row is None:
            raise ActionError('Действие не найдено или история уже удалена.')
        return row

    def get(self, ident: str) -> dict[str,Any]:
        row = self.row(ident)
        status = 'expired' if row['status']=='prepared' and row['expires_at']<=int(time.time()) else row['status']
        return {'ok':True,'id':row['id'],'tool':row['tool'],'arguments':json.loads(row['arguments']),
                'account':{'id':row['account_id'],'username':row['username']},'status':status,
                'status_ru':STATUS[status],'created_at':row['created_at'],'updated_at':row['updated_at'],
                'created_at_moscow':datetime.fromtimestamp(row['created_at'],timezone(timedelta(hours=3))).strftime('%d.%m.%Y %H:%M:%S МСК'),
                'updated_at_moscow':datetime.fromtimestamp(row['updated_at'],timezone(timedelta(hours=3))).strftime('%d.%m.%Y %H:%M:%S МСК'),
                'expires_at':row['expires_at'],'result':json.loads(row['result']) if row['result'] else None}

    def verify(self, ident: str, code: str):
        row = self.row(ident)
        if not secrets.compare_digest(row['code_hash'],hashlib.sha256(code.encode()).hexdigest()):
            raise ActionError('Код подтверждения не подходит. Проверьте выбранное действие.')
        if row['status']=='prepared' and row['expires_at']<=int(time.time()):
            raise ActionError('Предпросмотр устарел. Подготовьте и проверьте действие заново.')
        return row

    def claim(self, ident: str) -> bool:
        with self.db() as db:
            return db.execute("UPDATE actions SET status='running',updated_at=? WHERE id=? AND status='prepared' AND expires_at>?",(int(time.time()),ident,int(time.time()))).rowcount == 1

    def finish(self, ident: str, value: dict):
        error = value.get('error') or {}
        status = 'succeeded' if value.get('ok') is True else 'failed' if error.get('status_code') in (400,401,403,404,429) else 'uncertain'
        with self.db() as db:
            db.execute("UPDATE actions SET status=?,result=?,updated_at=? WHERE id=? AND status='running'",(status,json.dumps(value,ensure_ascii=False),int(time.time()),ident))

    def cancel(self, ident: str) -> dict:
        with self.db() as db:
            db.execute("UPDATE actions SET status='cancelled',updated_at=? WHERE id=? AND status='prepared'",(int(time.time()),ident))
        return self.get(ident)

    def history(self, limit: int = 20) -> list[dict]:
        with self.db() as db:
            rows = db.execute('SELECT id FROM actions ORDER BY created_at DESC,rowid DESC LIMIT ?',(min(100,max(1,limit)),)).fetchall()
        return [self.get(row['id']) for row in rows]
