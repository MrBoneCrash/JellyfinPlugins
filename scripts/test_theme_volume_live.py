"""Test the plugin in a disposable Windows Jellyfin 12.3 installation.

Requires the Release assembly, Node.js, and Playwright. All server data and
credentials stay under ignored .tools; only the test child process is stopped.
"""
from pathlib import Path
import hashlib
import json
import os
import secrets
import socket
import subprocess
import time
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / '.tools'


def distribution(url, filename, destination):
    if destination.exists():
        return
    archive = TOOLS / filename
    if not archive.exists():
        urllib.request.urlretrieve(url, archive)
    destination.mkdir(parents=True)
    with zipfile.ZipFile(archive) as bundle:
        bundle.extractall(destination)


def main():
    if os.name != 'nt':
        raise RuntimeError('The isolated portable-server test currently requires Windows.')
    TOOLS.mkdir(exist_ok=True)
    distribution('https://repo.jellyfin.org/files/server/windows/latest-stable/amd64/jellyfin_12.3-amd64.zip',
                 'jellyfin_12.3-amd64.zip', TOOLS / 'jellyfin-12.3')
    distribution('https://github.com/IAmParadox27/jellyfin-plugin-file-transformation/releases/download/3.0.2.0/Release-12.2.0.zip',
                 'file-transformation-3.0.2.zip', TOOLS / 'file-transformation-3.0.2')
    server = TOOLS / 'jellyfin-12.3/jellyfin'
    test = TOOLS / ('live-' + secrets.token_hex(6))
    for name in ['data/plugins', 'config', 'cache', 'logs', 'profile', 'temp', 'media/Test Movie']:
        (test / name).mkdir(parents=True)
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    (test / 'config/network.xml').write_text(
        '<NetworkConfiguration><InternalHttpPort>' + str(port) + '</InternalHttpPort>'
        '<EnableHttps>false</EnableHttps><EnableUPnP>false</EnableUPnP>'
        '<AutoDiscovery>false</AutoDiscovery><EnableRemoteAccess>false</EnableRemoteAccess>'
        '<LocalNetworkAddresses><string>127.0.0.1</string></LocalNetworkAddresses></NetworkConfiguration>')
    plugin = test / 'data/plugins/ThemeSongVolume'
    plugin.mkdir()
    import shutil
    shutil.copy2(ROOT / 'plugins/theme-song-volume/src/bin/Release/net10.0/Jellyfin.Plugin.ThemeSongVolume.dll', plugin)
    ft = test / 'data/plugins/FileTransformation'
    ft.mkdir()
    for dll in (TOOLS / 'file-transformation-3.0.2').rglob('*.dll'):
        shutil.copy2(dll, ft)
    ffmpeg = next(server.rglob('ffmpeg.exe'))
    movie = test / 'media/Test Movie/Test Movie.mp4'
    theme = movie.with_name('theme.mp3')
    subprocess.run([str(ffmpeg), '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=640x360:r=24',
                    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '5', '-c:v', 'libx264',
                    '-c:a', 'aac', str(movie)], check=True)
    subprocess.run([str(ffmpeg), '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=90',
                    '-af', 'volume=0.1', str(theme)], check=True)
    web = server / 'jellyfin-web'
    hashes = {p: hashlib.sha256(p.read_bytes()).digest() for p in web.rglob('*') if p.is_file()}
    env = {**os.environ, 'LOCALAPPDATA': str(test / 'profile'), 'TEMP': str(test / 'temp'), 'TMP': str(test / 'temp')}
    log = (test / 'server.log').open('w', encoding='utf-8')
    child = subprocess.Popen([str(server / 'jellyfin.exe'), '--datadir', str(test / 'data'),
                              '--configdir', str(test / 'config'), '--cachedir', str(test / 'cache'),
                              '--logdir', str(test / 'logs'), '--webdir', str(web), '--nonetchange'],
                             env=env, stdout=log, stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    base = f'http://127.0.0.1:{port}'
    headers = {}

    def call(route, method='GET', data=None):
        request = urllib.request.Request(base + route, method=method,
            data=None if data is None else json.dumps(data).encode(),
            headers={'Content-Type': 'application/json', **headers})
        with opener.open(request, timeout=30) as response:
            body = response.read()
            return json.loads(body) if body else None

    try:
        for attempt in range(90):
            try:
                call('/System/Info/Public')
                call('/Startup/User')
                break
            except (OSError, ValueError):
                if child.poll() is not None:
                    raise RuntimeError(f'Test server exited; inspect {test / "server.log"}')
                time.sleep(1)
        else:
            raise RuntimeError('Isolated server startup timed out.')
        print('Isolated Jellyfin server ready; creating synthetic test library.', flush=True)
        call('/Startup/User')
        password = secrets.token_urlsafe(24)
        call('/Startup/User', 'POST', {'Name': 'plugin-test', 'Password': password})
        call('/Startup/Configuration', 'POST', {'UICulture': 'en-US', 'MetadataCountryCode': 'US', 'PreferredMetadataLanguage': 'en'})
        call('/Startup/Complete', 'POST')
        headers['Authorization'] = 'MediaBrowser Client="Integration Test", Device="Isolated Browser", DeviceId="theme-volume-test", Version="1.0"'
        auth = call('/Users/AuthenticateByName', 'POST', {'Username': 'plugin-test', 'Pw': password})
        headers['Authorization'] = 'MediaBrowser Token="' + auth['AccessToken'] + '"'
        config = call('/System/Configuration')
        config['ServerName'] = 'Theme Volume Test'
        call('/System/Configuration', 'POST', config)
        # Completing the wizard starts an initial scan. Do not add a library
        # while that scan is enumerating the root folders.
        for attempt in range(60):
            if not any(task['State'] in ['Running', 'Cancelling'] for task in call('/ScheduledTasks')):
                break
            time.sleep(1)
        call('/Library/VirtualFolders?name=Plugin%20Test&collectionType=movies&refreshLibrary=true', 'POST', {
            'LibraryOptions': {'PathInfos': [{'Path': str(test / 'media')}], 'EnableRealtimeMonitor': False,
                'TypeOptions': [{'Type': 'Movie', 'MetadataFetchers': [], 'ImageFetchers': []}]}})
        for attempt in range(60):
            if any(task['State'] in ['Running', 'Cancelling'] for task in call('/ScheduledTasks')):
                time.sleep(1)
                continue
            items = call('/Items?Recursive=true&IncludeItemTypes=Movie')['Items']
            if items and call('/Items/' + items[0]['Id'] + '/ThemeMedia')['ThemeSongsResult']['Items']:
                break
            time.sleep(1)
        else:
            raise RuntimeError('Synthetic theme was not scanned: ' + str([item['Name'] for item in items]))
        session = test / 'session.json'
        session.write_text(json.dumps({'baseUrl': base, 'username': 'plugin-test', 'password': password,
            'token': auth['AccessToken'], 'userId': auth['User']['Id'], 'themePath': str(theme),
            'configurationDirectory': str(test / 'data/plugins/configurations')}))
        (ROOT / 'dist').mkdir(exist_ok=True)
        browser_env = {**os.environ, 'THEME_VOLUME_LIVE_SESSION': str(session),
            'THEME_VOLUME_LIVE_REPORT': str(ROOT / 'dist/theme-song-volume-live.json'),
            'THEME_VOLUME_LIVE_SCREENSHOT': str(ROOT / 'dist/theme-song-volume-live.png')}
        subprocess.run(['node', str(ROOT / 'plugins/theme-song-volume/tests/live-browser.cjs')],
                       env=browser_env, check=True, cwd=ROOT)
        assert all(hashlib.sha256(p.read_bytes()).digest() == checksum for p, checksum in hashes.items())
        report_path = ROOT / 'dist/theme-song-volume-live.json'
        report = json.loads(report_path.read_text())
        report['checks'].append('Installed Jellyfin web files remain unchanged')
        report_path.write_text(json.dumps(report, indent=2))
        print('PASS: Installed Jellyfin web files remain unchanged')
    finally:
        child.terminate()
        child.wait(timeout=30)
        log.close()


if __name__ == '__main__':
    main()
