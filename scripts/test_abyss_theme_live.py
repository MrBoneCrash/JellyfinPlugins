"""Verify Abyss against a disposable portable Windows Jellyfin installation.

Set ABYSS_JELLYFIN_DIR and ABYSS_FILE_TRANSFORMATION_DIR to extracted Jellyfin
12.3 and File Transformation 3.0.2.0 distributions. No existing server is touched.
Requires Node.js and Playwright (NODE_PATH may point to its node_modules).
"""
from pathlib import Path
import hashlib
import json
import os
import secrets
import shutil
import socket
import subprocess
import time
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PLUGIN_ID = 'de52c4ed-29ee-4e5f-b722-485dcd5503f0'
MARKER = 'id="MrBoneCrash-AbyssTheme-v1"'


def main():
    if os.name != 'nt':
        raise SystemExit('This portable-server test requires Windows.')
    server = Path(os.environ.get('ABYSS_JELLYFIN_DIR', ROOT / '.tools/jellyfin-12.3/jellyfin'))
    ft = Path(os.environ.get('ABYSS_FILE_TRANSFORMATION_DIR', ROOT / '.tools/file-transformation-3.0.2'))
    test = ROOT / '.tools' / ('abyss-live-' + secrets.token_hex(6))
    for name in ['data/plugins/AbyssTheme', 'data/plugins/FileTransformation', 'config', 'cache', 'logs', 'profile', 'temp']:
        (test / name).mkdir(parents=True)
    shutil.copytree(server / 'jellyfin-web', test / 'web')
    hashes = {p.relative_to(test / 'web'): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in (test / 'web').rglob('*') if p.is_file()}
    shutil.copy2(ROOT / 'plugins/abyss-theme/src/bin/Release/net10.0/Jellyfin.Plugin.AbyssTheme.dll', test / 'data/plugins/AbyssTheme')
    for dll in ft.rglob('*.dll'):
        shutil.copy2(dll, test / 'data/plugins/FileTransformation')
    # Optional immutable published build, never a moving development assembly.
    other = os.environ.get('ABYSS_THEME_VOLUME_DLL')
    if other:
        folder = test / 'data/plugins/ThemeSongVolume'
        folder.mkdir()
        shutil.copy2(other, folder / 'Jellyfin.Plugin.ThemeSongVolume.dll')
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    (test / 'config/network.xml').write_text(
        f'<NetworkConfiguration><InternalHttpPort>{port}</InternalHttpPort>'
        '<EnableHttps>false</EnableHttps><EnableUPnP>false</EnableUPnP>'
        '<AutoDiscovery>false</AutoDiscovery><EnableRemoteAccess>false</EnableRemoteAccess>'
        '<LocalNetworkAddresses><string>127.0.0.1</string></LocalNetworkAddresses></NetworkConfiguration>')
    base = f'http://127.0.0.1:{port}'
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    headers = {}
    child = None
    handles = []

    def request(route, method='GET', data=None, raw=False):
        req = urllib.request.Request(base + route, method=method,
            data=None if data is None else json.dumps(data).encode(),
            headers={'Content-Type': 'application/json', **headers})
        with opener.open(req, timeout=90 if route == '/AbyssTheme/check' else 20) as response:
            body = response.read().decode()
            return body if raw else json.loads(body) if body else None

    def start(initial_setup=False):
        nonlocal child
        log = (test / f'server-{len(handles)}.log').open('w', encoding='utf-8')
        handles.append(log)
        child = subprocess.Popen([str(server / 'jellyfin.exe'), '--datadir', str(test / 'data'),
            '--configdir', str(test / 'config'), '--cachedir', str(test / 'cache'),
            '--logdir', str(test / 'logs'), '--webdir', str(test / 'web'), '--nonetchange'],
            env={**os.environ, 'LOCALAPPDATA': str(test / 'profile'), 'TEMP': str(test / 'temp'), 'TMP': str(test / 'temp')},
            stdout=log, stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
        for _ in range(90):
            if child.poll() is not None:
                raise RuntimeError(f'Test server exited; inspect {test}')
            try:
                request('/System/Info/Public')
                if initial_setup:
                    request('/Startup/User')
                return
            except (OSError, ValueError):
                time.sleep(1)
        raise RuntimeError(f'Server startup timed out; inspect {test}')

    def stop():
        if child and child.poll() is None:
            child.terminate()
            child.wait(timeout=30)

    def themed():
        for _ in range(20):
            html = request('/web/index.html', raw=True)
            if MARKER in html:
                assert html.count(MARKER) == 1
                if other:
                    assert 'data-mbc-theme-volume' in html
                return html
            time.sleep(1)
        raise AssertionError('Abyss did not appear in the server Web response.')

    def denied(route, expected, method='GET', data=None):
        try:
            request(route, method, data)
        except urllib.error.HTTPError as error:
            assert error.code == expected, (route, error.code)
        else:
            raise AssertionError('Administration endpoint allowed unauthorized access: ' + route)

    try:
        start(initial_setup=True)
        request('/Startup/User')
        password = secrets.token_urlsafe(24)
        request('/Startup/User', 'POST', {'Name': 'abyss-test', 'Password': password})
        request('/Startup/Configuration', 'POST', {'UICulture': 'en-US', 'MetadataCountryCode': 'US', 'PreferredMetadataLanguage': 'en'})
        request('/Startup/Complete', 'POST')
        headers['Authorization'] = 'MediaBrowser Client="Abyss Test", Device="Isolated", DeviceId="abyss-test", Version="1"'
        auth = request('/Users/AuthenticateByName', 'POST', {'Username': 'abyss-test', 'Pw': password})
        headers['Authorization'] = 'MediaBrowser Token="' + auth['AccessToken'] + '"'
        admin_headers = headers.copy()
        headers.clear()
        for route, method, data in [('/AbyssTheme/status', 'GET', None), ('/AbyssTheme/settings', 'PUT', {}),
                                    ('/AbyssTheme/check', 'POST', None), ('/AbyssTheme/rollback', 'POST', None),
                                    ('/AbyssTheme/reset', 'POST', None)]:
            denied(route, 401, method, data)
        headers.update(admin_headers)
        server_config = request('/System/Configuration')
        server_config['ServerName'] = 'Abyss Preview'
        request('/System/Configuration', 'POST', server_config)
        user = request('/Users/New', 'POST', {'Name': 'abyss-viewer'})
        viewer = request('/Users/AuthenticateByName', 'POST', {'Username': 'abyss-viewer', 'Pw': ''})
        headers['Authorization'] = 'MediaBrowser Token="' + viewer['AccessToken'] + '"'
        for route, method, data in [('/AbyssTheme/status', 'GET', None), ('/AbyssTheme/settings', 'PUT', {}),
                                    ('/AbyssTheme/check', 'POST', None), ('/AbyssTheme/rollback', 'POST', None),
                                    ('/AbyssTheme/reset', 'POST', None)]:
            denied(route, 403, method, data)
        headers.update(admin_headers)
        # Only synthetic media and local artwork: no user's libraries or files.
        media = test / 'media'
        ffmpeg = next(server.rglob('ffmpeg.exe'))
        for title, color in [('Horizon', '0x345568'), ('Afterglow', '0x674158')]:
            folder = media / title
            folder.mkdir(parents=True)
            subprocess.run([str(ffmpeg), '-v', 'error', '-f', 'lavfi', '-i', f'color=c={color}:s=640x360:r=12',
                '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '120', '-c:v', 'libx264', '-preset', 'ultrafast',
                '-crf', '35', '-c:a', 'aac', str(folder / (title + '.mp4'))], check=True)
            subprocess.run([str(ffmpeg), '-v', 'error', '-f', 'lavfi', '-i', f'color=c={color}:s=1280x720',
                '-frames:v', '1', str(folder / 'backdrop.jpg')], check=True)
            (folder / (title + '.nfo')).write_text(f'<movie><title>{title}</title><year>2026</year><plot>A synthetic film used to verify Abyss Spotlight safely.</plot><rating>8.3</rating><mpaa>PG</mpaa></movie>')
        for _ in range(60):
            if not any(task['State'] in ['Running', 'Cancelling'] for task in request('/ScheduledTasks')):
                break
            time.sleep(1)
        request('/Library/VirtualFolders?name=Abyss%20Test&collectionType=movies&refreshLibrary=true', 'POST', {
            'LibraryOptions': {'PathInfos': [{'Path': str(media)}], 'EnableRealtimeMonitor': False,
                              'TypeOptions': [{'Type': 'Movie', 'MetadataFetchers': [], 'ImageFetchers': []}]}})
        for _ in range(60):
            movies = request('/Items?Recursive=true&IncludeItemTypes=Movie')['Items']
            if len(movies) == 2 and not any(task['State'] in ['Running', 'Cancelling'] for task in request('/ScheduledTasks')):
                break
            time.sleep(1)
        else:
            raise RuntimeError('Synthetic Spotlight library did not finish scanning.')
        viewer_policy = request('/Users/' + user['Id'])['Policy']
        viewer_policy['EnableAllFolders'] = False
        viewer_policy['EnabledFolders'] = []
        request('/Users/' + user['Id'] + '/Policy', 'POST', viewer_policy)
        plugins = request('/Plugins')
        assert any(p['Id'].replace('-', '').lower() == PLUGIN_ID.replace('-', '') for p in plugins)
        branding = request('/Branding/Configuration')
        branding['CustomCss'] = ':root { --abyss-test-preserved: 42; }'
        request('/System/Configuration/branding', 'POST', branding)
        themed()
        request('/AbyssTheme/settings', 'PUT', {'automaticUpdates': False, 'jellyfinEnhanced': True, 'mediaBarEnhanced': True})
        styled = request('/web/index.html', raw=True)
        assert 'data-abyss-override="je"' in styled and 'data-abyss-override="mbe"' in styled
        assert '#jellyfin-enhanced-panel' in styled and '#slides-container' in styled
        request('/AbyssTheme/rollback', 'POST')
        assert request('/AbyssTheme/status')['settings']['automaticUpdates'] is False
        request('/AbyssTheme/reset', 'POST')
        clean = request('/web/index.html', raw=True)
        assert 'data-abyss-override="je"' not in clean and 'data-abyss-override="mbe"' not in clean
        print('Real Jellyfin response includes Abyss and preserves the shared pipeline.', flush=True)
        env = {**os.environ, 'ABYSS_TEST_BASE': base, 'ABYSS_TEST_OUTPUT': str(test), 'ABYSS_TEST_TOKEN': auth['AccessToken'], 'ABYSS_TEST_PASSWORD': password, 'ABYSS_TEST_VIEWER_ID': user['Id']}
        subprocess.run(['node', str(ROOT / 'plugins/abyss-theme/tests/live-browser.cjs')], env=env, check=True)
        network_update_succeeded = None
        if os.environ.get('ABYSS_TEST_NETWORK_UPDATE') == '1':
            before = request('/AbyssTheme/status')['revision']
            check = request('/AbyssTheme/check', 'POST')
            network_update_succeeded = not check.get('error')
            if check.get('error'):
                assert check['revision'] == before
                print('Upstream unavailable; active theme retained: ' + check['error'], flush=True)
            else:
                assert check['lastChecked']
                print('Real upstream download and validation succeeded: ' + check['revision'], flush=True)
        request('/AbyssTheme/settings', 'PUT', {'automaticUpdates': False, 'jellyfinEnhanced': True, 'mediaBarEnhanced': True})
        saved = request('/AbyssTheme/status')
        stop()
        # Simulate replacement of index.html by an update; original on-disk
        # bytes plus a harmless marker must still receive the runtime theme.
        index = test / 'web/index.html'
        index.write_bytes(index.read_bytes() + b'\n<!-- abyss-update-test -->')
        hashes[Path('index.html')] = hashlib.sha256(index.read_bytes()).hexdigest()
        start()
        assert 'abyss-update-test' in themed()
        restored = request('/AbyssTheme/status')
        assert restored['revision'] == saved['revision'] and restored['settings'] == saved['settings']
        assert 'data-abyss-override="je"' in request('/web/index.html', raw=True)
        request('/AbyssTheme/rollback', 'POST')
        request('/AbyssTheme/reset', 'POST')
        assert request('/Branding/Configuration')['CustomCss'] == branding['CustomCss']
        print('Theme restored after restart with replaced Web index; branding preserved.', flush=True)
        version = ET.parse(ROOT / 'plugins/abyss-theme/src/AbyssTheme.csproj').findtext('./PropertyGroup/Version')
        request('/Plugins/' + PLUGIN_ID + '/' + version, 'DELETE')
        stop()
        start()
        html = request('/web/index.html', raw=True)
        assert MARKER not in html
        if other:
            assert 'data-mbc-theme-volume' in html
        assert request('/Branding/Configuration')['CustomCss'] == branding['CustomCss']
        assert not (test / 'data/plugins/configurations/MrBoneCrash.AbyssTheme/state.json').exists()
        assert all(hashlib.sha256((test / 'web' / p).read_bytes()).hexdigest() == value for p, value in hashes.items())
        result = {'server': '12.3.0', 'fileTransformation': '3.0.2.0', 'browser': 'Chromium',
            'restoredAfterIndexReplacement': True, 'uninstall': True, 'brandingPreserved': True,
            'webFilesUnchanged': True, 'themeVolumePipeline': bool(other), 'testDirectory': str(test)}
        result.update(adminOnlyEndpoints=True, optionalOverrides=True, persistedSettings=True,
                      configurationControls=True, spotlightSyntheticMedia=True, restrictedAccountIsolation=True,
                      reversibleHomeOrder=True, runtimeCleanup=True, upstreamDownloadSucceeded=network_update_succeeded)
        (ROOT / 'dist').mkdir(exist_ok=True)
        (ROOT / 'dist/abyss-theme-live.json').write_text(json.dumps(result, indent=2))
        print(json.dumps(result, indent=2), flush=True)
    finally:
        stop()
        for log in handles:
            log.close()


if __name__ == '__main__':
    main()
