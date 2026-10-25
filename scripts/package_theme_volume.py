#!/usr/bin/env python3
"""Package a previously built Theme Song Volume plugin without server assemblies."""
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "plugins" / "theme-song-volume"
ASSEMBLY = PLUGIN / "src/bin/Release/net10.0/Jellyfin.Plugin.ThemeSongVolume.dll"


def main():
    if not ASSEMBLY.is_file():
        raise SystemExit("Build the plugin in Release mode before packaging it.")
    target = ROOT / "dist/ThemeSongVolume-1.0.0.0.zip"
    target.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as package:
        for source, name in ((ASSEMBLY, ASSEMBLY.name), (PLUGIN / "README.md", "README.md")):
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            package.writestr(info, source.read_bytes())
    print(target)


if __name__ == "__main__":
    main()
