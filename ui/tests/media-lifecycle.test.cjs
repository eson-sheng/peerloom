// Exercise the real hook with fake devices/signaling, without browser permissions.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

function media(kind) {
    const track = {kind, enabled: true, readyState: 'live', stop() {this.readyState = 'ended';}, addEventListener() {}};
    return {getTracks: () => [track], getAudioTracks: () => kind === 'audio' ? [track] : [], getVideoTracks: () => kind === 'video' ? [track] : []};
}
function setup() {
    const states = [], notices = [], sent = [], effects = [], sockets = [], peers = [];
    const voice = media('audio');
    const timers = new Map(); let nextTimer = 0;
    let ws;
    class Socket {
        static OPEN = 1;
        OPEN = 1;
        readyState = 1;
        constructor() { ws = this; sockets.push(this); }
        send(raw) {sent.push(JSON.parse(raw));}
        close() {this.readyState = 3;}
    }
    const React = {
        useRef: (current) => ({current}),
        useState: (initial) => {
            const entry = {value: initial}; states.push(entry);
            return [initial, (next) => {entry.value = typeof next === 'function' ? next(entry.value) : next;}];
        },
        useEffect(fn) {effects.push(fn);},
        useCallback: (fn) => fn,
    };
    const imports = {
        react: React,
        notistack: {useSnackbar: () => ({enqueueSnackbar: (message) => notices.push(message)})},
        './i18n': {i18n: {}}, './message': {},
        './settings': {loadSettings: () => ({name: 'test'}), resolveCodecPlaceholder: () => null},
        './url': {urlWithSlash: 'http://test/'},
        './useConfig': {authModeToRoomMode: () => 'local'},
        './useRoomID': {getFromURL: () => undefined, useRoomID: () => [undefined, () => {}]},
    };
    class Peer {
        connectionState = 'new';
        constructor() {peers.push(this);}
        close() {this.connectionState = 'closed';}
        createDataChannel() {return {readyState: 'connecting', close() {this.readyState = 'closed';}};}
        async createOffer() {return {};}
        async setLocalDescription() {}
        getTransceivers() {return [];}
        addTrack() {}
    }
    const context = {RTCPeerConnection: Peer, MediaStream: class {getTracks() {return [];} getVideoTracks() {return [];}}, exports: {}, require: (id) => {assert.ok(id in imports, id); return imports[id];}, console,
        window: {location: {search: ''}, setTimeout: (fn, delay) => {const id = ++nextTimer; timers.set(id, {fn, delay}); return id;}, clearTimeout: id => timers.delete(id)}, WebSocket: Socket,
        navigator: {mediaDevices: {getUserMedia: async () => voice}},
    };
    const source = fs.readFileSync(path.join(__dirname, '../src/useRoom.ts'), 'utf8');
    vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText, context);
    const hook = context.exports.useRoom({});
    hook.room({type: 'join', payload: {id: 'room'}});
    const info = {id: 'room', maxMediaSeats: 6, users: [{id: 'me', you: true, mediaEnabled: true, mediaActive: true, streaming: false}]};
    const receive = (type, payload) => ws.onmessage({data: JSON.stringify({type, payload})});
    receive('room', info);
    return {hook, voice, sent, notices, info, receive, effects, sockets, peers, timers, state: () => states[0].value};
}

test('voice stays live through playback start/stop and uses independent signaling', async () => {
    const s = setup();
    await s.hook.startMicrophone();
    assert.equal(s.state().microphoneActive, true);
    assert.equal(s.state().hostStream, undefined);
    assert.equal(s.sent.at(-1).payload.kind, 'voice');
    const video = media('video');
    let confirmed = false;
    const start = s.hook.startPlayback(video).then(() => {confirmed = true;});
    await Promise.resolve(); assert.equal(confirmed, false, 'must wait for server acceptance');
    s.receive('room', {...s.info, users: [{...s.info.users[0], streaming: true, voiceActive: true}]});
    await start;
    s.hook.stopPlayback();
    assert.equal(video.getTracks()[0].readyState, 'ended');
    assert.equal(s.voice.getTracks()[0].readyState, 'live');
    assert.equal(s.state().microphoneActive, true);
    s.hook.toggleMicrophone(); assert.equal(s.voice.getTracks()[0].enabled, false);
    s.hook.leaveRoom(); assert.equal(s.voice.getTracks()[0].readyState, 'ended');
});

test('rejected playback cleans content but preserves microphone and room', async () => {
    const s = setup(); await s.hook.startMicrophone();
    const video = media('video');
    const failed = assert.rejects(s.hook.startPlayback(video), /未获准/);
    s.receive('error', {operation: 'share', message: '已有成员正在共享内容'});
    await failed;
    assert.equal(video.getTracks()[0].readyState, 'ended');
    assert.equal(s.voice.getTracks()[0].readyState, 'live');
    assert.ok(s.state());
    s.hook.leaveRoom();
});

test('media revocation releases voice and content together', async () => {
    const s = setup(); await s.hook.startMicrophone();
    const video = media('video');
    const start = s.hook.startPlayback(video);
    s.receive('room', {...s.info, users: [{...s.info.users[0], streaming: true}]}); await start;
    s.receive('room', {...s.info, users: [{...s.info.users[0], mediaActive: false, mediaEnabled: false}]});
    assert.equal(video.getTracks()[0].readyState, 'ended');
    assert.equal(s.voice.getTracks()[0].readyState, 'ended');
    assert.equal(s.state().microphoneActive, false);
});

test('seat restriction is reported before sending a share request', async () => {
    const s = setup();
    s.receive('room', {...s.info, users: [{...s.info.users[0], mediaActive: false}]});
    const video = media('video');
    await assert.rejects(s.hook.startPlayback(video), /请先进入媒体区/);
    assert.equal(s.sent.length, 0);
    assert.equal(video.getTracks()[0].readyState, 'ended');
});


test('old socket close and messages cannot destroy a newly joined room', () => {
    const s = setup(); const old = s.sockets[0];
    s.hook.room({type: 'join', payload: {id: 'new'}});
    s.receive('room', {...s.info, id: 'new'});
    old.onclose({reason: 'late close'});
    old.onmessage({data: JSON.stringify({type: 'room', payload: {...s.info, id: 'old'}})});
    assert.equal(s.state().id, 'new'); assert.equal(s.notices.length, 0);
    s.hook.leaveRoom();
});

test('unexpected connection error releases voice and pending peer connections', async () => {
    const s = setup(); await s.hook.startMicrophone();
    s.receive('hostsession', {id: 'data1', peer: 'other', kind: 'data', iceServers: []});
    s.sockets[0].onerror({});
    await Promise.resolve(); await Promise.resolve();
    assert.equal(s.voice.getTracks()[0].readyState, 'ended');
    assert.equal(s.peers[0].connectionState, 'closed');
    assert.equal(s.state(), false);
    assert.match(s.notices.at(-1), /重新加入/);
});

test('unmount cleanup releases microphone and websocket', async () => {
    const s = setup(); await s.hook.startMicrophone();
    const dispose = s.effects[1](); dispose();
    assert.equal(s.voice.getTracks()[0].readyState, 'ended');
    assert.equal(s.sockets[0].readyState, 3);
});


test('data retries use session identity, back off and are cancelled on leave', async () => {
    const s = setup();
    s.receive('room', {...s.info, users: [...s.info.users, {id: 'other', mediaActive: true, mediaEnabled: true}]});
    s.receive('hostsession', {id: 'sid1', peer: 'other', kind: 'data', iceServers: []});
    await Promise.resolve(); await Promise.resolve();
    assert.equal(s.timers.size, 1);
    const [id, timer] = [...s.timers][0]; assert.equal(timer.delay, 5000);
    s.timers.delete(id); timer.fn();
    assert.deepEqual(s.sent.at(-1), {type: 'datareconnect', payload: {target: 'other', sid: 'sid1'}});
    s.receive('endshare', 'sid1');
    s.receive('hostsession', {id: 'sid2', peer: 'other', kind: 'data', iceServers: []});
    assert.equal([...s.timers.values()][0].delay, 10000);
    s.hook.leaveRoom(); assert.equal(s.timers.size, 0);
});
