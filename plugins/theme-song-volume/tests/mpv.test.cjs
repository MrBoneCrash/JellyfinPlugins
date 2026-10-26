const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createMpvPlayback } = require('../src/Web/client.js');

const song = { Id: 'bc7977c8ec094da4803097c7e5a21491', MediaType: 'Audio' };
function fixture() {
    const callbacks = new Map();
    const events = {
        on(player, name, handler) { const list = callbacks.get(name) || []; list.push(handler); callbacks.set(name, list); },
        off(player, name, handler) { callbacks.set(name, (callbacks.get(name) || []).filter(fn => fn !== handler)); },
        trigger(player, name) { for (const fn of [...callbacks.get(name) || []]) fn(); }
    };
    const writes = [];
    const player = { id: 'mpvaudioplayer', name: 'MPV Audio Player', events, volume: 80,
        getSavedVolume: () => .8, getVolume() { return this.volume; },
        setVolume(value, save) { writes.push({ value, save }); this.volume = value; } };
    let ready = 0;
    const adapter = createMpvPlayback(item => item === song, () => ready++);
    const begin = item => {
        adapter.beforePlay(player, { item }); player._currentPlayOptions = { item };
        player.volume = 80; events.trigger(player, 'playing');
    };
    return { adapter, player, writes, begin, events, callbacks, ready: () => ready };
}

test('MPV applies personal theme volume without persisting master volume', () => {
    const f = fixture(); f.begin(song);
    assert.equal(f.player.volume, 20); assert.equal(f.ready(), 1);
    f.adapter.setProfile({ volume: 50, overrides: {} }); assert.equal(f.player.volume, 40);
    f.adapter.setProfile({ volume: 50, overrides: { [song.Id]: 0 } }); assert.equal(f.player.volume, 0);
    assert.ok(f.writes.every(write => write.save === false));
    f.adapter.dispose(); assert.equal(f.player.volume, 80);
    assert.ok([...f.callbacks.values()].every(handlers => handlers.length === 0));
});

test('manual theme playback and other native players receive no adjustment', () => {
    const f = fixture(); f.begin({ ...song }); assert.equal(f.writes.length, 0);
    f.player.id = 'exoplayer'; f.begin(song); assert.equal(f.writes.length, 0);
    f.adapter.dispose();
});

test('MPV stop restores the master after the core fade restoration', () => {
    const f = fixture(); f.begin(song); f.player._isFadingOut = true;
    f.adapter.setProfile({ volume: 50, overrides: {} });
    assert.equal(f.player.volume, 20);
    f.player._isFadingOut = false; f.events.trigger(f.player, 'stopped');
    assert.equal(f.player.volume, 80); assert.equal(f.adapter.diagnostics().length, 0);
});

test('MPV uninstall during a fade waits for stopped and then removes listeners', () => {
    const f = fixture(); f.begin(song); f.player._isFadingOut = true; f.adapter.dispose();
    assert.equal(f.player.volume, 20);
    f.player._isFadingOut = false; f.events.trigger(f.player, 'stopped');
    assert.equal(f.player.volume, 80);
    assert.ok([...f.callbacks.values()].every(handlers => handlers.length === 0));
});

test('MPV cleanup preserves unrelated player changes and late events', () => {
    const f = fixture(); f.begin(song); f.player.volume = 63; f.adapter.dispose();
    assert.equal(f.player.volume, 63);
    f.events.trigger(f.player, 'playing'); assert.equal(f.player.volume, 63);
    f.adapter.dispose();
});

test('MPV releases attenuation before ordinary playback dispatch', () => {
    const f = fixture(); f.begin(song);
    f.adapter.beforePlay(f.player, { item: { Id: 'ordinary-music' } });
    assert.equal(f.player.volume, 80);
    assert.ok([...f.callbacks.values()].every(handlers => handlers.length === 0));
});

test('adapter cooperates with the official JMP 1.12.0 audio class when supplied', {
    skip: !process.env.THEME_VOLUME_MPV_SOURCE
}, async () => {
    const callbacks = new WeakMap();
    const events = {
        on(obj, name, fn) { const all = callbacks.get(obj) || {}; (all[name] ||= []).push(fn); callbacks.set(obj, all); },
        off(obj, name, fn) { const all = callbacks.get(obj) || {}; all[name] = (all[name] || []).filter(f => f !== fn); },
        trigger(obj, name) { for (const fn of [...callbacks.get(obj)?.[name] || []]) fn(); }
    };
    const signal = () => { const handlers = new Set(); return {
        connect: fn => handlers.add(fn), disconnect: fn => handlers.delete(fn),
        emit: (...args) => [...handlers].forEach(fn => fn(...args)) }; };
    const writes = [], preferences = [];
    const native = { playing: signal(), positionUpdate: signal(), finished: signal(), updateDuration: signal(), error: signal(), paused: signal(),
        setVolume: value => writes.push(value), setPlaybackRate() {}, setMuted() {}, pause() {}, stop() {},
        load(url, options, metadata, stream, extra, done) { done(); } };
    const context = vm.createContext({ window: { api: { player: native } }, api: { player: native },
        console, Promise, setTimeout, clearTimeout });
    vm.runInContext(fs.readFileSync(process.env.THEME_VOLUME_MPV_SOURCE, 'utf8'), context);
    const player = new context.window._mpvAudioPlayer({ events, appHost: {}, toast() {},
        appSettings: { get: () => .8, set: (...args) => preferences.push(args) } });
    const adapter = createMpvPlayback(item => item === song, () => {});
    adapter.beforePlay(player, { item: song }); await player.play({ item: song, url: 'fixture.mp3' });
    native.playing.emit(); assert.equal(writes.at(-1), 20);
    adapter.setProfile({ volume: 50, overrides: {} }); assert.equal(writes.at(-1), 40);
    await player.stop(false); assert.equal(writes.at(-1), 80);
    assert.deepEqual(preferences, []); adapter.dispose();
});
