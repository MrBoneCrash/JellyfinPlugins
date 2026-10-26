const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPlayback } = require('../src/Web/client.js');

function setup() {
    const tasks = [];
    return { playback: createPlayback(fn => tasks.push(fn)), flush: () => { tasks.splice(0).forEach(fn => fn()); } };
}
const song = { Id: 'bc7977c8-ec09-4da4-8030-97c7e5a21491' };
const id = song.Id.replace(/-/g, '');

test('theme volume is relative to the master and never persisted', () => {
    const { playback } = setup();
    const audio = { volume: 0.8 };
    playback.prepare(audio, song);
    assert.equal(audio.volume, 0.2);
    assert.equal(playback.shouldPersist(audio), false);
});

test('a zero override mutes and removing it restores the default', () => {
    const { playback } = setup();
    const audio = { volume: 0.8 };
    playback.setProfile({ volume: 50, overrides: { [id]: 0 } });
    playback.prepare(audio, song);
    assert.equal(audio.volume, 0);
    playback.setProfile({ volume: 50, overrides: {} });
    assert.equal(audio.volume, 0.4);
});

test('regular playback restores master volume and persistence', () => {
    const { playback, flush } = setup();
    const audio = { volume: 0.8 };
    playback.prepare(audio, song);
    playback.prepare(audio, null);
    assert.equal(audio.volume, 0.8);
    assert.equal(playback.shouldPersist(audio), false); // queued restoration event
    flush();
    assert.equal(playback.shouldPersist(audio), true);
});

test('core player resets and other plugin changes are preserved', () => {
    const { playback, flush } = setup();
    const audio = { volume: 0.8 };
    playback.prepare(audio, song);
    audio.volume = 0.6;
    playback.prepare(audio, null);
    flush();
    assert.equal(audio.volume, 0.6);
});

test('repeated preparation does not compound attenuation', () => {
    const { playback, flush } = setup();
    const audio = { volume: 0.8 };
    playback.prepare(audio, song);
    playback.prepare(audio, song);
    flush();
    assert.equal(audio.volume, 0.2);
    assert.equal(playback.shouldPersist(audio), false);
});

test('session reset permits the next authenticated session', () => {
    const { playback, flush } = setup();
    const audio = { volume: 0.8 };
    playback.prepare(audio, song);
    playback.reset(); flush();
    assert.equal(audio.volume, 0.8);
    playback.prepare(audio, song);
    assert.equal(audio.volume, 0.2);
});

test('core fade restoration on a reused element cannot compound theme attenuation', () => {
    const { playback, flush } = setup();
    const audio = { volume: 0.8 };
    playback.prepare(audio, song, 0.8);
    playback.release(audio); flush();
    // Jellyfin stop() restores the volume captured before its fade began.
    audio.volume = 0.2;
    playback.prepare(audio, song, 0.8);
    assert.equal(audio.volume, 0.2);
    playback.setProfile({ volume: 50, overrides: {} });
    assert.equal(audio.volume, 0.4);
    playback.dispose(); flush();
    assert.equal(audio.volume, 0.8);
});

test('disposal restores volume and is safe to repeat', () => {
    const { playback, flush } = setup();
    const audio = { volume: 0.8 };
    playback.prepare(audio, song);
    playback.dispose(); playback.dispose(); flush();
    assert.equal(audio.volume, 0.8);
    assert.equal(playback.shouldPersist(audio), true);
    playback.prepare(audio, song);
    assert.equal(audio.volume, 0.8);
});
