import argparse
import importlib.util
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "catalog", Path(__file__).resolve().parents[1] / "scripts" / "catalog.py"
)
catalog = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(catalog)


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        patcher = patch.object(catalog, "ROOT", self.root)
        patcher.start()
        self.addCleanup(patcher.stop)
        catalog.init(argparse.Namespace(
            slug="test-plugin", name="Test", owner="Tester", overview="Overview",
            description="Description", category="General", guid=None,
        ))
        self.archive = self.root / "plugin.zip"
        with zipfile.ZipFile(self.archive, "w") as package:
            package.writestr("Test.dll", b"test fixture, not a real assembly")

    def release(self, number="1.0.0.0"):
        catalog.add_release(argparse.Namespace(
            slug="test-plugin", version=number, target_abi="10.11.0.0",
            zip=str(self.archive), url="https://example.com/plugin.zip", changelog="Test",
        ))

    def test_unreleased_plugin_is_excluded(self):
        self.assertEqual(catalog.collect(), [])

    def test_release_checksum_and_numeric_order(self):
        self.release("2.0.0.0")
        self.release("10.0.0.0")
        entries = catalog.collect()[0]["versions"]
        self.assertEqual([e["version"] for e in entries], ["10.0.0.0", "2.0.0.0"])
        self.assertEqual(entries[0]["checksum"], catalog.hashlib.md5(self.archive.read_bytes()).hexdigest())

    def test_duplicate_release_does_not_modify_file(self):
        self.release()
        path = self.root / "plugins/test-plugin/versions.json"
        original = path.read_bytes()
        with self.assertRaises(ValueError):
            self.release()
        self.assertEqual(path.read_bytes(), original)

    def test_duplicate_guid_is_rejected(self):
        self.release()
        source = self.root / "plugins/test-plugin"
        duplicate = self.root / "plugins/duplicate"
        duplicate.mkdir()
        for name in ("plugin.json", "versions.json"):
            (duplicate / name).write_bytes((source / name).read_bytes())
        with self.assertRaisesRegex(ValueError, "Duplicate plugin GUID"):
            catalog.collect()

    def test_nested_dll_is_rejected(self):
        with zipfile.ZipFile(self.archive, "w") as package:
            package.writestr("nested/Test.dll", b"fixture")
        with self.assertRaisesRegex(ValueError, "at the archive root"):
            self.release()

    def test_path_traversal_is_rejected(self):
        with self.assertRaises(ValueError):
            catalog.plugin_dir("../outside")

    def test_build_and_check_detect_stale_manifest(self):
        catalog.write(self.root / "manifest.json", [])
        self.release()
        with patch("sys.argv", ["catalog.py", "build", "--check"]):
            self.assertEqual(catalog.main(), 1)
        with patch("sys.argv", ["catalog.py", "build"]):
            self.assertEqual(catalog.main(), 0)
        with patch("sys.argv", ["catalog.py", "build", "--check"]):
            self.assertEqual(catalog.main(), 0)


if __name__ == "__main__":
    unittest.main()
