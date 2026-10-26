(function () {
    'use strict';
    var key = '__MrBoneCrashAbyssThemeV1';
    if (window[key]) window[key].dispose();
    var suppressed;
    var observer = new MutationObserver(update);
    function update() {
        var route = location.pathname + '/' + location.hash.replace(/^#\/?/, '');
        var next = /(?:^|\/)(?:dashboard|configurationpage)(?:\/|\?|$)/i.test(route);
        if (next === suppressed) return;
        suppressed = next;
        document.querySelectorAll('#MrBoneCrash-AbyssTheme-v1, style[data-abyss-override]').forEach(function (style) {
            style.media = next ? 'not all' : 'all';
        });
    }
    function attach() {
        suppressed = undefined;
        window.addEventListener('hashchange', update);
        window.addEventListener('popstate', update);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        update();
    }
    function pause() {
        window.removeEventListener('hashchange', update);
        window.removeEventListener('popstate', update);
        observer.disconnect();
    }
    function dispose() {
        pause();
        window.removeEventListener('pagehide', pause);
        window.removeEventListener('pageshow', attach);
        document.querySelectorAll('#MrBoneCrash-AbyssTheme-v1, style[data-abyss-override]').forEach(function (style) { style.media = 'not all'; });
        delete window[key];
    }
    window[key] = { dispose: dispose };
    window.addEventListener('pagehide', pause);
    window.addEventListener('pageshow', attach);
    attach();
})();
