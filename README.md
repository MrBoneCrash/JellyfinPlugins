# Jellyfin Plugins

Plugins for your Jellyfin server, available to install through Jellyfin's plugin
catalog. Add this repository once to access the plugins and their future updates.

## Available plugins

| Plugin | Features | Requirements | Status |
| --- | --- | --- | --- |
| [Theme Song Volume](plugins/theme-song-volume/README.md) | Default theme-song volume and individual song overrides, without changing audio files. | Jellyfin 12.3, File Transformation 3.x, compatible server-hosted Web client. | Preview; see the plugin guide for installation and fixes. |
| [Abyss Theme](plugins/abyss-theme/README.md) | Persistent Abyss CSS by Om Gupta (AumGupta), optional theme updates, rollback and plugin adaptations. | Jellyfin 12.3, File Transformation 3.x, compatible server-hosted Web client with Dark selected. | Preview; available in the plugin catalog. |

## Installation

1. Open your Jellyfin server's **Dashboard**.
2. Go to **Plugins > Repositories** and add a repository.
3. Enter **MrBoneCrash Plugins** as the name and paste this repository URL:

   ```text
   https://raw.githubusercontent.com/MrBoneCrash/JellyfinPlugins/main/manifest.json
   ```

4. Save the repository, then open the plugin **Catalog**.
5. Select a plugin, choose a version compatible with your Jellyfin server, and
   click **Install**.
6. Restart Jellyfin to load the plugin. Check the plugin's documentation for any
   additional configuration.

For the Theme Song Volume preview, follow its
[installation guide](plugins/theme-song-volume/README.md). If version 0.1.0.0
prevents your plugin dashboard from loading, the guide includes recovery steps
using the 0.1.0.1 fix.

## Updates

Available releases appear in Jellyfin's plugin catalog. Check the plugin's release
notes and supported Jellyfin version before updating, then restart Jellyfin after
installation.

## Help and feedback

For plugin-specific setup, features, and compatibility, see the documentation
linked in the plugin list above once plugins are available.

Report problems or request features through
[GitHub Issues](https://github.com/MrBoneCrash/JellyfinPlugins/issues).
Include the plugin name and version, your Jellyfin version, and relevant log
messages when reporting a problem. Remove passwords, API keys, and other private
information from logs before sharing them.

Repository development and release instructions are in the
[maintenance guide](docs/maintaining.md).
