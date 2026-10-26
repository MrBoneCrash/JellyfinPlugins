const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/Web/client.js'), 'utf8');

test('Dashboard isolation, ordinary navigation, repeated initialization and cleanup', () => {
    const styles = [{ media: '' }, { media: '' }, { media: '' }];
    const listeners = new Map();
    const observers = [];
    const location = { pathname: '/jellyfin/web/index.html', hash: '#/home' };
    const window = {
        addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
        removeEventListener(name, callback) { listeners.get(name)?.delete(callback); }
    };
    const context = vm.createContext({ window, location,
        document: { documentElement: {}, querySelectorAll: () => styles },
        MutationObserver: class {
            constructor(callback) { this.callback = callback; observers.push(this); }
            observe() { this.active = true; }
            disconnect() { this.active = false; }
        }
    });
    function event(name) { for (const callback of [...listeners.get(name) || []]) callback(); }
    vm.runInContext(source, context);
    assert.ok(styles.every(style => style.media === 'all'));
    for (const hash of ['#/dashboard', '#/dashboard/plugins', '#/configurationpage?name=AbyssTheme']) {
        location.hash = hash;
        event('hashchange');
        assert.ok(styles.every(style => style.media === 'not all'));
    }
    location.hash = '#/details?id=123';
    event('popstate');
    assert.ok(styles.every(style => style.media === 'all'));
    location.hash = '';
    location.pathname = '/jellyfin/web/dashboard/plugins';
    observers.at(-1).callback();
    assert.ok(styles.every(style => style.media === 'not all'));
    vm.runInContext(source, context);
    assert.equal(listeners.get('hashchange').size, 1);
    assert.equal(observers.filter(observer => observer.active).length, 1);
    event('pagehide');
    assert.equal(listeners.get('hashchange').size, 0);
    assert.ok(observers.every(observer => !observer.active));
    event('pageshow');
    assert.equal(listeners.get('hashchange').size, 1);
    window.__MrBoneCrashAbyssThemeV1.dispose();
    assert.ok([...listeners.values()].every(set => set.size === 0));
    assert.ok(observers.every(observer => !observer.active));
    assert.ok(styles.every(style => style.media === 'not all'));
});
