#!/usr/bin/env python3
"""Manage a Jellyfin plugin catalog using only the Python standard library."""

import argparse
import hashlib
import json
import re
import sys
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def version(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d+\.\d+\.\d+\.\d+", value):
        raise ValueError(f"Expected a four-part version, e.g. 1.0.0.0: {value!r}")
    parts = tuple(map(int, value.split(".")))
    if any(part > 2147483647 for part in parts):
        raise ValueError(f"Version component is too large: {value}")
    return parts


def plugin_dir(slug):
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise ValueError("Plugin ID: use lowercase letters, numbers, and single hyphens only.")
    return ROOT / "plugins" / slug


def validate_plugin(data):
    if not isinstance(data, dict):
        raise ValueError("plugin.json must contain an object.")
    for key in ("guid", "name", "description", "overview", "owner", "category"):
        if not isinstance(data.get(key), str) or not data[key].strip():
            raise ValueError(f"Plugin field is missing or empty: {key}")
    uuid.UUID(data["guid"])
    if "versions" in data:
        raise ValueError("Versions must be stored in versions.json.")


def validate_versions(entries):
    if not isinstance(entries, list):
        raise ValueError("versions.json must contain an array.")
    seen = set()
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError("Each version must be an object.")
        number = version(entry.get("version"))
        version(entry.get("targetAbi"))
        if number in seen:
            raise ValueError(f"Duplicate version: {entry['version']}")
        seen.add(number)
        url = urlparse(entry.get("sourceUrl", ""))
        if url.scheme != "https" or not url.netloc or url.username or url.password:
            raise ValueError("sourceUrl must be an HTTPS download URL without credentials.")
        if not re.fullmatch(r"[a-fA-F0-9]{32}", entry.get("checksum", "")):
            raise ValueError("checksum must be the MD5 checksum of the release ZIP.")
        datetime.strptime(entry.get("timestamp", ""), "%Y-%m-%d %H:%M:%S")
        if not isinstance(entry.get("changelog"), str):
            raise ValueError("changelog must be a string.")


def collect():
    catalog = []
    guids = set()
    for path in sorted((ROOT / "plugins").glob("*/plugin.json")):
        data = read(path)
        validate_plugin(data)
        guid = str(uuid.UUID(data["guid"]))
        if guid in guids:
            raise ValueError(f"Duplicate plugin GUID: {guid}")
        guids.add(guid)
        entries = read(path.with_name("versions.json"))
        validate_versions(entries)
        if entries:
            catalog.append({**data, "versions": sorted(entries, key=lambda e: version(e["version"]), reverse=True)})
    return catalog


def init(args):
    path = plugin_dir(args.slug)
    data = {
        "guid": str(uuid.UUID(args.guid)) if args.guid else str(uuid.uuid4()),
        "name": args.name,
        "overview": args.overview,
        "description": args.description,
        "owner": args.owner,
        "category": args.category,
    }
    validate_plugin(data)
    for existing in (ROOT / "plugins").glob("*/plugin.json"):
        if uuid.UUID(read(existing)["guid"]) == uuid.UUID(data["guid"]):
            raise ValueError("This GUID already belongs to another plugin.")
    path.mkdir(parents=True, exist_ok=False)
    write(path / "plugin.json", data)
    write(path / "versions.json", [])
    print(f"Plugin created: {path}\nGUID (use the same ID in the C# plugin): {data['guid']}")


def add_release(args):
    path = plugin_dir(args.slug)
    validate_plugin(read(path / "plugin.json"))
    entries = read(path / "versions.json")
    validate_versions(entries)
    archive = Path(args.zip)
    with zipfile.ZipFile(archive) as package:
        if not any('/' not in name and name.lower().endswith('.dll') for name in package.namelist()):
            raise ValueError("The ZIP must contain at least one plugin DLL at the archive root.")
        if package.testzip() is not None:
            raise ValueError("The ZIP contains corrupted files.")
    entry = {
        "version": args.version,
        "changelog": args.changelog,
        "targetAbi": args.target_abi,
        "sourceUrl": args.url,
        "checksum": hashlib.md5(archive.read_bytes()).hexdigest(),
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
    }
    entries.append(entry)
    validate_versions(entries)
    write(path / "versions.json", sorted(entries, key=lambda e: version(e["version"]), reverse=True))
    print("Version added. Next: python scripts/catalog.py build")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    new = commands.add_parser("init", help="Create plugin metadata")
    new.add_argument("slug")
    for field in ("name", "owner", "overview", "description"):
        new.add_argument(f"--{field}", required=True)
    new.add_argument("--category", default="General")
    new.add_argument("--guid", help="Existing plugin GUID; generated if omitted")
    release = commands.add_parser("add-release", help="Register a packaged release ZIP")
    release.add_argument("slug")
    for field in ("version", "target-abi", "zip", "url", "changelog"):
        release.add_argument(f"--{field}", required=True)
    build = commands.add_parser("build", help="Generate or validate manifest.json")
    build.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        if args.command == "init":
            init(args)
        elif args.command == "add-release":
            add_release(args)
        else:
            catalog = collect()
            target = ROOT / "manifest.json"
            if args.check:
                if read(target) != catalog:
                    raise ValueError("manifest.json is out of date. Run 'python scripts/catalog.py build'.")
                print(f"Catalog valid: {len(catalog)} published plugins.")
            else:
                write(target, catalog)
                print(f"manifest.json generated: {len(catalog)} published plugins.")
    except (ValueError, OSError, TypeError, KeyError, zipfile.BadZipFile) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
