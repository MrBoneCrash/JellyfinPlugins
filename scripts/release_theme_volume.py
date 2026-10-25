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
from urllib.parse import quote
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "MrBoneCrash/JellyfinPlugins"


def run(*args):
    result = subprocess.run(args, cwd=ROOT, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(f"{args[0]} {args[1]} failed: {result.stderr.strip() or result.stdout.strip()}")
    return result.stdout.strip()


def find_release(tag):
    # GitHub's release-by-tag endpoint does not reliably find unpublished drafts.
    pages = json.loads(run("gh", "api", f"repos/{REPOSITORY}/releases?per_page=100", "--paginate", "--slurp"))
    matches = [release for page in pages for release in page if release["tag_name"] == tag]
    if len(matches) > 1:
        raise ValueError("Multiple releases use this tag. Resolve the duplicate drafts before publishing.")
    return matches[0] if matches else None


def create_draft(tag, version, head):
    payload = {
        "tag_name": tag, "target_commitish": head,
        "name": f"Theme Song Volume {version} Preview",
        "body": (ROOT / ".github/releases/theme-song-volume.md").read_text(encoding="utf-8"),
        "draft": True, "prerelease": True,
    }
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "release.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        # Use the creation response directly; draft lookup can lag behind writes.
        return json.loads(run("gh", "api", "--method", "POST", f"repos/{REPOSITORY}/releases", "--input", str(path)))


def publish_draft(release_id, tag, head):
    result = json.loads(run("gh", "api", "--method", "PATCH", f"repos/{REPOSITORY}/releases/{release_id}",
        "-f", f"tag_name={tag}", "-f", f"target_commitish={head}",
        "-F", "draft=false", "-F", "prerelease=true", "-f", "make_latest=false"))
    if result.get("tag_name") != tag or result.get("draft") is not False or result.get("prerelease") is not True:
        raise ValueError("The published release has an unexpected tag or preview status. Catalog update stopped.")
    return result


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
    changelog = request.get("changelog")
    if not isinstance(changelog, str) or not changelog.strip():
        raise ValueError("The release request must include a non-empty changelog.")
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
    head = run("git", "rev-parse", "HEAD")
    release = find_release(tag)
    if release is None:
        release = create_draft(tag, version, head)
    release_id = int(release["id"])
    release_endpoint = f"repos/{REPOSITORY}/releases/{release_id}"
    if not release["prerelease"]:
        raise ValueError("An existing stable release will not be changed.")
    if release["draft"] and release["target_commitish"] != head:
        if release["assets"]:
            raise ValueError("An older draft already contains assets; it will not be overwritten.")
        run("gh", "api", "--method", "PATCH", release_endpoint,
            "-f", f"tag_name={tag}", "-f", f"target_commitish={head}", "-F", "draft=true", "-F", "prerelease=true")
    asset = next((item for item in release["assets"] if item["name"] == archive.name), None)
    if asset:
        with tempfile.TemporaryDirectory() as directory:
            run("gh", "release", "download", tag, "--repo", REPOSITORY, "--pattern", archive.name, "--dir", directory)
            if hashlib.md5((Path(directory) / archive.name).read_bytes()).hexdigest() != checksum:
                raise ValueError("An existing release asset differs; it will not be overwritten.")
    else:
        if not release["draft"]:
            raise ValueError("A published release is missing its ZIP; repair it explicitly.")
        upload_url = f"https://uploads.github.com/repos/{REPOSITORY}/releases/{release_id}/assets?name={quote(archive.name)}"
        run("gh", "api", "--method", "POST", upload_url, "--header", "Content-Type: application/zip", "--input", str(archive))
    if release["draft"]:
        publish_draft(release_id, tag, head)
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
            changelog)
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
