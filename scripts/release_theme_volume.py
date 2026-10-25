#!/usr/bin/env python3
"""Publish the tested Theme Song Volume artifact and then update its catalog."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "MrBoneCrash/JellyfinPlugins"


def run(*args):
    return subprocess.run(args, cwd=ROOT, check=True, text=True, capture_output=True).stdout.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate local release inputs without publishing")
    args = parser.parse_args()
    request = json.loads((ROOT / ".github/releases/theme-song-volume.json").read_text(encoding="utf-8"))
    version = request["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+\.\d+", version):
        raise ValueError("Release version must have four numeric components.")
    if request.get("prerelease") is not True:
        raise ValueError("This workflow only publishes previews.")
    project_version = ET.parse(ROOT / "plugins/theme-song-volume/src/ThemeSongVolume.csproj").findtext("./PropertyGroup/Version")
    if project_version != version:
        raise ValueError("Release request and project versions differ.")
    archive = ROOT / f"dist/ThemeSongVolume-{version}.zip"
    with zipfile.ZipFile(archive) as package:
        if "Jellyfin.Plugin.ThemeSongVolume.dll" not in package.namelist() or package.testzip():
            raise ValueError("The release artifact is not a valid plugin ZIP.")
    checksum = hashlib.md5(archive.read_bytes()).hexdigest()
    tag = f"theme-song-volume-v{version}"
    if args.check:
        print(f"Release inputs valid: {tag}, MD5 {checksum}. Nothing published.")
        return
    if os.environ.get("GITHUB_REPOSITORY") != REPOSITORY or os.environ.get("GITHUB_REF") != "refs/heads/main":
        raise ValueError("Publishing is restricted to this repository's main branch on GitHub Actions.")
    # Refuse a stale build rather than updating the catalog from an older revision.
    run("git", "fetch", "origin", "main")
    if run("git", "rev-parse", "HEAD") != run("git", "rev-parse", "origin/main"):
        raise ValueError("main changed during verification. Run the release workflow again on the latest commit.")
    endpoint = f"repos/{REPOSITORY}/releases/tags/{tag}"
    existing = subprocess.run(["gh", "api", endpoint], cwd=ROOT, text=True, capture_output=True)
    if existing.returncode:
        if "404" not in existing.stderr:
            raise RuntimeError("Could not inspect the existing GitHub release.")
        run("gh", "release", "create", tag, "--repo", REPOSITORY, "--target", run("git", "rev-parse", "HEAD"),
            "--draft", "--prerelease", "--title", f"Theme Song Volume {version} Preview",
            "--notes-file", str(ROOT / ".github/releases/theme-song-volume.md"))
    release = json.loads(run("gh", "api", endpoint))
    if not release["prerelease"]:
        raise ValueError("An existing stable release will not be changed.")
    asset = next((item for item in release["assets"] if item["name"] == archive.name), None)
    if asset:
        with tempfile.TemporaryDirectory() as directory:
            run("gh", "release", "download", tag, "--repo", REPOSITORY, "--pattern", archive.name, "--dir", directory)
            if hashlib.md5((Path(directory) / archive.name).read_bytes()).hexdigest() != checksum:
                raise ValueError("An existing release asset differs; it will not be overwritten.")
    else:
        if not release["draft"]:
            raise ValueError("A published release is missing its ZIP; repair it explicitly.")
        run("gh", "release", "upload", tag, str(archive), "--repo", REPOSITORY)
    if release["draft"]:
        run("gh", "release", "edit", tag, "--repo", REPOSITORY, "--draft=false", "--prerelease", "--latest=false")
    url = f"https://github.com/{REPOSITORY}/releases/download/{tag}/{archive.name}"
    entries_path = ROOT / "plugins/theme-song-volume/versions.json"
    entries = json.loads(entries_path.read_text(encoding="utf-8"))
    registered = next((entry for entry in entries if entry["version"] == version), None)
    if registered:
        if (registered["checksum"], registered["sourceUrl"], registered["targetAbi"]) != (checksum, url, request["targetAbi"]):
            raise ValueError("The existing catalog version differs from the release.")
    else:
        run("python", "scripts/catalog.py", "add-release", "theme-song-volume", "--version", version,
            "--target-abi", request["targetAbi"], "--zip", str(archive), "--url", url, "--changelog",
            "[PREVIEW] Fix plugin discovery and GET /Plugins failing in BasePlugin.get_CanUninstall(). Requires Jellyfin 12.3 and File Transformation 3.x.")
    run("python", "scripts/catalog.py", "build")
    run("python", "scripts/catalog.py", "build", "--check")
    run("git", "config", "user.name", "github-actions[bot]")
    run("git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com")
    run("git", "add", "plugins/theme-song-volume/versions.json", "manifest.json")
    if subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=ROOT).returncode:
        run("git", "commit", "-m", f"Publish Theme Song Volume {version} preview in catalog")
        run("git", "push", "origin", "HEAD:main")
    print(f"Published https://github.com/{REPOSITORY}/releases/tag/{tag} and updated the catalog.")


if __name__ == "__main__":
    main()
