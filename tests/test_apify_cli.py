"""Exercise collection controls without real Apify credentials or paid jobs."""
from contextlib import redirect_stderr
from io import StringIO
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.error import URLError

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("apify_collection", ROOT / "scripts/apify_reels.py")
apify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(apify)


class ApifyCollectionTests(unittest.TestCase):
    def test_missing_secret_stops_before_any_network_or_paid_start(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(apify, "Client") as client:
            output = StringIO()
            with redirect_stderr(output):
                self.assertEqual(apify.main(["--start"]), 2)
            client.assert_not_called()
            self.assertIn("APIFY_API_TOKEN", output.getvalue())

    def test_bounded_hashtag_start_is_one_explicit_post(self):
        client = Mock()
        client.request.return_value = {"data": {"id": "run123"}}
        result = apify.start_run(client, "gta6", 20)
        self.assertEqual(result["id"], "run123")
        path, data = client.request.call_args.args
        self.assertIn("maxItems=80", path)
        self.assertIn("maxTotalChargeUsd=1", path)
        self.assertIn("timeout=300", path)
        self.assertEqual(data, {"hashtags": ["gta6"], "resultsLimit": 80})
        self.assertEqual(client.request.call_count, 1)

    def test_run_resume_uses_only_status_reads_and_returns_dataset(self):
        client = Mock()
        client.request.side_effect = [{"data": {"status": "RUNNING"}},
                                      {"data": {"status": "SUCCEEDED", "defaultDatasetId": "data123"}}]
        with patch.object(apify.time, "sleep"):
            self.assertEqual(apify.await_run(client, "run123"), "data123")
        self.assertTrue(all(call.args == ("actor-runs/run123",) for call in client.request.call_args_list))

    def test_ambiguous_start_is_not_retried_and_does_not_print_the_secret(self):
        secret = "test-only-credential-that-must-not-appear"
        client = apify.Client(secret)
        client.opener = Mock()
        client.opener.open.side_effect = URLError(secret)
        with self.assertRaises(apify.ApifyError) as raised:
            client.request("acts/example/runs", {"hashtags": ["gta6"]})
        self.assertEqual(client.opener.open.call_count, 1)
        self.assertNotIn(secret, str(raised.exception))
        request = client.opener.open.call_args.args[0]
        self.assertEqual(request.get_header("Authorization"), "Bearer " + secret)
        self.assertTrue(request.full_url.startswith("https://api.apify.com/v2/"))
        self.assertNotIn(secret, request.full_url)

    def test_saved_candidates_strip_raw_credentials_and_do_not_claim_video_review(self):
        client = Mock()
        client.request.return_value = [{"type": "Video", "shortCode": "GTATEST001", "ownerUsername": "test_creator",
                                        "caption": "Nobody tells you about these 3 GTA VI details.", "videoViewCount": 300,
                                        "apiToken": "test-only-secret-in-provider-object"}]
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp) / "gta6"
            path, count = apify.save_candidates(client, "dataset123", folder)
            self.assertEqual(count, 1)
            data = json.loads(path.read_text())
            self.assertEqual(data[0]["account"], "@test_creator")
            self.assertFalse(data[0]["videoHookReviewed"])
            self.assertNotIn("test-only-secret-in-provider-object", path.read_text())
            self.assertFalse(json.loads((folder / "source.json").read_text())["videoHooksReviewed"])

    def test_invalid_dataset_ids_cannot_redirect_a_credentialled_request(self):
        client = Mock()
        for value in ("../../private", "https://untrusted.example", "id?token=value"):
            with self.assertRaises(apify.ApifyError):
                apify.save_candidates(client, value, Path("unused"))
        client.request.assert_not_called()
