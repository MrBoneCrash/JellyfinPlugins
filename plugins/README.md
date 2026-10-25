# Organizing plugins

Each plugin gets its own directory:

```text
plugins/my-plugin/
  plugin.json       # Name, GUID, description, owner, and category
  versions.json     # Published versions with download URLs and checksums
  src/              # Optional: C# source code and project files
  README.md         # Optional: plugin documentation
```

Directories containing `plugin.json` are included when generating the catalog.
The tool manages `versions.json`. Plugins without a published version do not
appear in the catalog yet. Source code may also live in a separate repository,
with only catalog metadata managed here.

Create new entries using `python scripts/catalog.py init`; see the
[repository instructions](../README.md).
