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
    def test_publication_preserves_the_explicit_release_tag(self):
        expected = {"tag_name": "preview-tag", "draft": False, "prerelease": True}
        with patch.object(release, "run", return_value=json.dumps(expected)) as run:
            self.assertEqual(release.publish_draft(123, "preview-tag", "tested-commit"), expected)
            self.assertIn("tag_name=preview-tag", run.call_args.args)
            self.assertIn("target_commitish=tested-commit", run.call_args.args)

    def test_wrong_published_tag_stops_catalog_publication(self):
        wrong = {"tag_name": "untagged-example", "draft": False, "prerelease": True}
        with patch.object(release, "run", return_value=json.dumps(wrong)):
            with self.assertRaisesRegex(ValueError, "unexpected tag"):
                release.publish_draft(123, "preview-tag", "tested-commit")

    def test_creation_returns_id_without_a_second_lookup(self):
        created = {"id": 123, "draft": True, "prerelease": True}

        def create(*args):
            self.assertEqual(args[:4], ("gh", "api", "--method", "POST"))
            payload = json.loads(Path(args[-1]).read_text(encoding="utf-8"))
            self.assertTrue(payload["draft"])
            self.assertTrue(payload["prerelease"])
            self.assertEqual(payload["target_commitish"], "tested-commit")
            return json.dumps(created)

        with patch.object(release, "run", side_effect=create) as run:
            self.assertEqual(release.create_draft("preview-tag", "0.1.0.2", "tested-commit"), created)
            self.assertEqual(run.call_count, 1)

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
