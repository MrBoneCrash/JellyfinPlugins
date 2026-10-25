import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "release_theme_volume", Path(__file__).resolve().parents[1] / "scripts/release_theme_volume.py"
)
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


class ReleaseDiscoveryTests(unittest.TestCase):
    def test_finds_draft_without_a_published_tag_across_pages(self):
        draft = {"id": 2, "tag_name": "theme-song-volume-v0.1.0.1", "draft": True}
        pages = [[{"id": 1, "tag_name": "other-version", "draft": False}], [draft]]
        with patch.object(release, "run", return_value=json.dumps(pages)) as run:
            self.assertEqual(release.find_release(draft["tag_name"]), draft)
            self.assertIn("--paginate", run.call_args.args)
            self.assertIn("--slurp", run.call_args.args)

    def test_missing_release_returns_none(self):
        with patch.object(release, "run", return_value="[[]]"):
            self.assertIsNone(release.find_release("missing"))

    def test_duplicate_drafts_are_rejected(self):
        pages = [[{"tag_name": "duplicate"}, {"tag_name": "duplicate"}]]
        with patch.object(release, "run", return_value=json.dumps(pages)):
            with self.assertRaisesRegex(ValueError, "Multiple releases"):
                release.find_release("duplicate")
