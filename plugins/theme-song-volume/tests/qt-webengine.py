"""DOM compatibility test on JMP's actual Qt WebEngine 5.15.2 / Chromium 83.

Run with Python 3.9, PyQt5==5.15.2 and PyQtWebEngine==5.15.2.
Uses an offscreen, disposable page and loopback fixture; no installed app/account.
This tests UI compatibility, not JMP's native playback backend.
"""
import json
import os
from pathlib import Path
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

os.environ.setdefault('QT_QPA_PLATFORM', 'windows' if os.name == 'nt' else 'offscreen')
os.environ.setdefault('QT_OPENGL', 'software')
os.environ.setdefault('QTWEBENGINE_CHROMIUM_FLAGS', '--disable-gpu')
from PyQt5.QtCore import QTimer, QUrl, Qt, qInstallMessageHandler
from PyQt5.QtWidgets import QApplication
from PyQt5.QtWebEngineWidgets import QWebEnginePage, QWebEngineProfile

SCRIPT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / 'src/Web/client.js'
profile = {'volume': 25, 'overrides': {}}
removed = False
HTML = '''<!doctype html><html><head><script>
window.ApiClient={getCurrentUserId:()=> 'test-user', accessToken:()=> 'fixture-token', serverAddress:()=> location.origin};
</script><script defer src="/ThemeSongVolume/client.js"></script></head><body>
<main class="itemDetailPage"><div class="mainDetailButtons">Play</div><div class="detailPagePrimaryContent"></div></main>
<script>
window.addEventListener('load', async () => {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const until = async predicate => {
        for (let i=0;i<200;i++) { if (predicate()) return; await new Promise(r=>setTimeout(r,25)); }
        throw new Error('Timed out waiting for test state');
    };
    try {
        assert(navigator.userAgent.includes('Chrome/83.'), 'Expected actual Chromium 83 engine');
        assert(typeof Element.prototype.replaceChildren === 'undefined', 'Expected missing replaceChildren API');
        await until(() => window.__MrBoneCrashThemeVolumeV1?.diagnostics().settingsLoaded);
        const bridge = window.__MrBoneCrashThemeVolumeV1;
        const song = {Id:'bc7977c8ec094da4803097c7e5a21491',MediaType:'Audio',Name:'Qt test theme'};
        bridge.audioReady();
        const themes = [song];
        assert(bridge.themes(themes) === themes, 'Theme hook must return original items without throwing');
        const audio = document.createElement('audio'); document.body.appendChild(audio); audio.volume=.8;
        bridge.prepare(audio,song,.8);
        assert(Math.abs(audio.volume-.2)<.001,'Default attenuation');
        let panel = document.getElementById('mbc-theme-volume'); panel.open=true;
        assert(panel.querySelector('select').options.length===1,'Song dropdown must contain its song');
        const volume = panel.querySelector('input[aria-label="Default volume"]');
        volume.value='50'; volume.dispatchEvent(new Event('input')); volume.dispatchEvent(new Event('change'));
        await until(() => panel.querySelector('[role=status]')?.textContent==='Saved');
        assert(Math.abs(audio.volume-.4)<.001,'Saved slider changes playback');
        // Repeat actual theme-hook/navigation ordering, with a cached hidden view.
        for(let i=0;i<3;i++) {
            const oldView=document.querySelector('.itemDetailPage:not(.hide)'); oldView.classList.add('hide');
            const view=document.createElement('main'); view.className='itemDetailPage';
            view.innerHTML='<div class="mainDetailButtons">Play</div><div class="detailPagePrimaryContent"></div>';
            document.body.appendChild(view);
            bridge.themes(themes);
            document.dispatchEvent(new CustomEvent('viewshow'));
            panel=document.getElementById('mbc-theme-volume'); panel.open=true;
            assert(panel.closest('.itemDetailPage')===view,'Panel belongs to the active view');
            assert(panel.querySelectorAll('input[type=range]').length===2,'Navigation preserves non-empty controls');
            assert(document.querySelectorAll('#mbc-theme-volume').length===1,'Exactly one panel');
            oldView.remove();
        }
        await fetch('/remove-fixture',{method:'POST'});
        document.dispatchEvent(new CustomEvent('viewshow'));
        await until(() => !window.__MrBoneCrashThemeVolumeV1);
        assert(!document.getElementById('mbc-theme-volume'),'Panel cleanup');
        assert(!document.getElementById('mbc-theme-volume-style'),'Style cleanup');
        assert(Math.abs(audio.volume-.8)<.001,'Master volume restored');
        assert(localStorage.length===0,'No browser storage');
        console.log('QT_TEST_RESULT '+JSON.stringify({passed:true,engine:navigator.userAgent,
            checks:['non-empty controls','song dropdown','save','theme hook returns normally','cached-view navigation','uninstall cleanup']}));
    } catch(error) { console.log('QT_TEST_RESULT '+JSON.stringify({passed:false,error:String(error)})); }
});
</script></body></html>'''


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def respond(self, status, body, content_type='application/json'):
        body = body.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith('/ThemeSongVolume/client.js'):
            self.respond(200, SCRIPT.read_text(encoding='utf-8'), 'application/javascript')
        elif self.path == '/ThemeSongVolume/settings':
            assert self.headers['Authorization'] == 'MediaBrowser Token="fixture-token"'
            self.respond(410 if removed else 200, json.dumps({'profile': profile, 'integrationReady': True}))
        else:
            self.respond(200, HTML, 'text/html')

    def do_PUT(self):
        global profile
        profile = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        self.respond(200, json.dumps(profile))

    def do_POST(self):
        global removed
        removed = True
        self.respond(204, '')


class Page(QWebEnginePage):
    def javaScriptConsoleMessage(self, level, message, line, source):
        if message.startswith('QT_TEST_RESULT '):
            result = json.loads(message[len('QT_TEST_RESULT '):])
            print(json.dumps(result, indent=2), flush=True)
            app.exit(0 if result['passed'] else 1)
        elif level == QWebEnginePage.ErrorMessageLevel:
            print('Qt JavaScript error: ' + message, flush=True)


QApplication.setAttribute(Qt.AA_ShareOpenGLContexts)
qInstallMessageHandler(lambda kind, context, message: print('Qt: ' + message, flush=True))
app = QApplication([])
server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
web_profile = QWebEngineProfile()  # Off-the-record; no installed client profile.
page = Page(web_profile)
QTimer.singleShot(20000, lambda: app.exit(2))
page.load(QUrl('http://127.0.0.1:' + str(server.server_port)))
result = app.exec_()
server.shutdown()
sys.exit(result)
