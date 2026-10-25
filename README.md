# Jellyfin Plugin Repository

Ein gemeinsames Repository zum Organisieren und Veröffentlichen eigener
Jellyfin-Plugins. Jellyfin liest den Katalog aus `manifest.json`; die installierbaren
ZIP-Dateien werden als GitHub-Release-Assets bereitgestellt.

Der Katalog ist anfangs bewusst leer (`[]`). Neue Plugins erscheinen erst darin,
wenn mindestens eine Version mit einem echten Download eingetragen wurde.

## Struktur

```text
manifest.json                  # Öffentlicher Jellyfin-Katalog (generiert)
plugins/<plugin-id>/plugin.json # Stammdaten je Plugin
plugins/<plugin-id>/versions.json
plugins/<plugin-id>/src/        # Optional: Plugin-Quellcode
scripts/catalog.py             # Verwaltung und Validierung
tests/                         # Tests für das Katalogwerkzeug
.github/workflows/validate.yml  # Automatische Prüfung bei Push und Pull Request
```

Voraussetzung für die Verwaltung: Python 3.11 oder neuer, keine Zusatzpakete.
Für die Entwicklung von C#-Plugins zusätzlich das zur jeweiligen Jellyfin-Version
passende .NET SDK und die entsprechenden Jellyfin-Pakete verwenden.

## Neues Plugin anlegen

Im Repository-Ordner ausführen (PowerShell, eine Zeile):

```powershell
python scripts/catalog.py init mein-plugin --name "Mein Plugin" --owner "DEIN-GITHUB-NAME" --overview "Kurze Zusammenfassung" --description "Beschreibung der Funktionen" --category "General"
```

Das Werkzeug erzeugt `plugin.json` und eine leere `versions.json`. Die erzeugte
GUID muss auch die ID des C#-Plugins sein und über alle Versionen gleich bleiben.
Für ein bestehendes Plugin die vorhandene ID mit `--guid "DEINE-PLUGIN-GUID"`
übernehmen. Optional kann `imageUrl` in `plugin.json` auf ein öffentlich erreichbares
Bild verweisen. Namen, Texte und Kategorie lassen sich dort bearbeiten.

Der eigentliche Plugin-Code kann unter `plugins/mein-plugin/src/` oder in einem
eigenen Repository liegen. Als Ausgangspunkt für C#-Plugins dient das
[offizielle Jellyfin-Plugin-Template](https://github.com/jellyfin/jellyfin-plugin-template).

## Version veröffentlichen

1. Plugin für die gewünschte Jellyfin-Version bauen. Die Plugin-DLL und benötigte
   zusätzliche Dateien direkt in ein ZIP packen, ohne umschließenden Unterordner.
   Jellyfin-eigene Assemblies nicht als Plugin-Abhängigkeiten mitliefern.
2. Auf GitHub ein Release erstellen, beispielsweise mit dem Tag
   `mein-plugin-v1.0.0.0`, und das ZIP als Asset hochladen. Kein automatisch
   erzeugtes Quellcode-ZIP verwenden.
3. Exakt dieses ZIP lokal erfassen. Die Angaben unten sind Platzhalter:

```powershell
python scripts/catalog.py add-release mein-plugin --version "1.0.0.0" --target-abi "10.11.0.0" --zip "dist/MeinPlugin-1.0.0.0.zip" --url "https://github.com/DEIN-NAME/DEIN-REPO/releases/download/mein-plugin-v1.0.0.0/MeinPlugin-1.0.0.0.zip" --changelog "Erste Version"
python scripts/catalog.py build
python scripts/catalog.py build --check
```

`targetAbi` ist die erforderliche Jellyfin-Server-ABI und muss zum gebauten Plugin
passen; der Beispielwert ist keine automatisch festgestellte Kompatibilität.
Plugin-Version und ABI werden vierstellig angegeben. Die MD5-Prüfsumme wird aus
dem lokalen ZIP berechnet, der Zeitstempel in UTC gesetzt. Das Werkzeug prüft die
ZIP-Struktur und Metadaten, lädt aber die Download-URL nicht zur Kontrolle ab.

Anschließend `plugins/` und `manifest.json` committen und pushen. Neue Versionen
werden ergänzt, ältere bleiben erhalten; neueste Versionen stehen zuerst.
Ein bereits veröffentlichtes ZIP nicht nachträglich ersetzen, da sonst die
Prüfsumme nicht mehr stimmt. Für Korrekturen eine neue Version veröffentlichen.

## Auf GitHub bereitstellen

Ein leeres, öffentliches GitHub-Repository erstellen. Für den ersten Push:

```powershell
git add .
git commit -m "Initialize Jellyfin plugin repository"
git branch -M main
git remote add origin https://github.com/DEIN-NAME/DEIN-REPO.git
git push -u origin main
```

Diese Befehle sind für das hier vorbereitete Repository ohne Remote vorgesehen.
Die GitHub Actions prüfen Metadaten, Katalog und Werkzeugtests. Sie bauen keine
C#-Plugins und erstellen keine Releases; deren Build hängt vom jeweiligen Projekt ab.
GitHub Pages ist für den Katalog nicht erforderlich.

## In Jellyfin hinzufügen

Unter **Dashboard → Plugins → Repositories** ein Repository mit frei wählbarem
Namen und folgender URL hinzufügen:

```text
https://raw.githubusercontent.com/DEIN-NAME/DEIN-REPO/main/manifest.json
```

`DEIN-NAME` und `DEIN-REPO` ersetzen; bei einem anderen Standardbranch auch `main`
anpassen. Manifest und Release-Assets müssen für den Jellyfin-Server ohne Anmeldung
erreichbar sein. Anschließend das Plugin im Katalog installieren und Jellyfin
neu starten. Solange der Katalog leer ist, werden keine Plugins angezeigt.

## Lokal prüfen

```powershell
python -m unittest discover -s tests -v
python scripts/catalog.py build --check
```

Das generierte Manifest nicht von Hand pflegen, sondern die Dateien unter
`plugins/` bearbeiten und anschließend `build` ausführen.
Vor der Veröffentlichung eine passende Lizenz für die eigenen Plugins ergänzen.

Format und Repository-Einbindung orientieren sich an der
[Jellyfin-Dokumentation](https://jellyfin.org/docs/general/server/plugins/) und der
[offiziellen Manifest-Beschreibung](https://jellyfin.org/posts/plugin-updates/).
