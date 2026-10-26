"""Package the built Abyss Theme plugin, documentation, and mandatory licenses."""
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "plugins/abyss-theme"


def main():
    assembly = PLUGIN / "src/bin/Release/net10.0/Jellyfin.Plugin.AbyssTheme.dll"
    if not assembly.is_file():
        raise SystemExit("Build Abyss Theme in Release mode before packaging.")
    version = ET.parse(PLUGIN / "src/AbyssTheme.csproj").findtext("./PropertyGroup/Version")
    if not version:
        raise SystemExit("Missing plugin version.")
    target = ROOT / f"dist/AbyssTheme-{version}.zip"
    target.parent.mkdir(exist_ok=True)
    sources = [(assembly, assembly.name)] + [
        (PLUGIN / name, name) for name in
        ("README.md", "CHANGELOG.md", "VERIFICATION.md", "LICENSE", "third-party/Abyss-LICENSE.txt")
    ]
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as package:
        for source, name in sources:
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            package.writestr(info, source.read_bytes())
    print(target)


if __name__ == "__main__":
    main()
