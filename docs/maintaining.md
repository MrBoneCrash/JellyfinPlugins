# Maintaining the plugin repository

A shared repository for organizing and publishing your own Jellyfin plugins.
Jellyfin reads the catalog from `manifest.json`; installable ZIP files are hosted
as GitHub release assets.

The catalog starts empty (`[]`). Plugins appear once at least one version with
a real download has been registered.

## Structure

```text
manifest.json                  # Public Jellyfin catalog (generated)
plugins/<plugin-id>/plugin.json # Metadata for each plugin
plugins/<plugin-id>/versions.json
plugins/<plugin-id>/src/        # Optional: plugin source code
scripts/catalog.py             # Catalog management and validation
tests/                         # Catalog tooling tests
.github/workflows/validate.yml  # Automatic checks on pushes and pull requests
```

Catalog management requires Python 3.11 or later, with no additional packages.
Developing C# plugins also requires the .NET SDK and Jellyfin packages appropriate
for the targeted Jellyfin version.

## Add a plugin

Run this command from the repository directory (PowerShell, on one line):

```powershell
python scripts/catalog.py init my-plugin --name "My Plugin" --owner "YOUR-GITHUB-NAME" --overview "Short summary" --description "Description of the features" --category "General"
```

The tool creates `plugin.json` and an empty `versions.json`. The generated GUID
must also be the ID of the C# plugin and must remain unchanged across versions.
For an existing plugin, supply its current ID using `--guid "YOUR-PLUGIN-GUID"`.
Optionally, add `imageUrl` to `plugin.json` to reference a publicly accessible
image. You can edit the name, descriptions, and category in that file.

Plugin source code can live in `plugins/my-plugin/src/` or in a separate repository.
Use the [official Jellyfin plugin template](https://github.com/jellyfin/jellyfin-plugin-template)
as a starting point for C# plugins.

## Publish a version

1. Build the plugin for the intended Jellyfin version. Package the plugin DLL and
   any required additional files directly in a ZIP, without an enclosing directory.
   Do not bundle Jellyfin's own assemblies as plugin dependencies.
2. Create a GitHub release, for example with the tag `my-plugin-v1.0.0.0`, and
   upload the ZIP as an asset. Do not use GitHub's automatically generated source ZIP.
3. Register that exact ZIP locally. The following values are placeholders:

```powershell
python scripts/catalog.py add-release my-plugin --version "1.0.0.0" --target-abi "10.11.0.0" --zip "dist/MyPlugin-1.0.0.0.zip" --url "https://github.com/MrBoneCrash/JellyfinPlugins/releases/download/my-plugin-v1.0.0.0/MyPlugin-1.0.0.0.zip" --changelog "Initial release"
python scripts/catalog.py build
python scripts/catalog.py build --check
```

`targetAbi` is the required Jellyfin server ABI and must match the built plugin;
the example value does not indicate automatically verified compatibility.
Use four-part values for both the plugin version and ABI. The MD5 checksum is
calculated from the local ZIP, and the timestamp is recorded in UTC. The tool
checks the ZIP structure and metadata but does not download the URL for verification.

Then commit and push `plugins/` and `manifest.json`. New versions are added while
older versions are retained, with the newest versions listed first. Do not replace
an already published ZIP, as this would invalidate its checksum. Publish a new
version for corrections.

## Hosting

The public repository is [MrBoneCrash/JellyfinPlugins](https://github.com/MrBoneCrash/JellyfinPlugins).
Commit and push catalog updates to its `main` branch. GitHub Actions validates
metadata, the catalog, and tooling tests. It does not build C# plugins or create
releases; those builds depend on each plugin project. GitHub Pages is not required.

The public catalog URL is:

```text
https://raw.githubusercontent.com/MrBoneCrash/JellyfinPlugins/main/manifest.json
```

The manifest and release assets must be accessible without authentication.
See the [installation instructions](../README.md) for the user-facing setup.

## Run local checks

```powershell
python -m unittest discover -s tests -v
python scripts/catalog.py build --check
```

To update the generated manifest, edit the files under `plugins/` and run `build`.
Choose and add an appropriate license for your plugins before publishing them.

The catalog format and repository setup follow the
[Jellyfin documentation](https://jellyfin.org/docs/general/server/plugins/) and the
[official manifest description](https://jellyfin.org/posts/plugin-updates/).
