import {useSnackbar} from 'notistack';
import React from 'react';
import {i18n} from './i18n';
import {
    ICEServer,
    IncomingMessage,
    JoinRoom,
    OutgoingMessage,
    RoomCreate,
    RoomInfo,
	CollaborationMessage,
    UIConfig,
} from './message';
import {loadSettings, resolveCodecPlaceholder} from './settings';
import {urlWithSlash} from './url';
import {authModeToRoomMode} from './useConfig';
import {getFromURL, useRoomID} from './useRoomID';

export type RoomState = false | ConnectedRoom;
export type PeerConnectionStatus = {id: string; peerID: string; connectionState: RTCPeerConnectionState; iceState: RTCIceConnectionState; route: 'direct' | 'turn' | 'unknown'; rttMs?: number; dataChannelState?: RTCDataChannelState; uploadBps: number; downloadBps: number; packetLossRate?: number};
export type ConnectionStatus = {serverLatencyMs?: number; websocketState: string; peers: PeerConnectionStatus[]; dataChannelSentBytes: number; dataChannelReceivedBytes: number; dataChannelUploadBps: number; dataChannelDownloadBps: number; sampledAt: number};
export type ConnectedRoom = {
    ws: WebSocket;
    hostStream?: MediaStream;
    microphoneActive: boolean;
    microphoneMuted: boolean;
    clientStreams: ClientStream[];
	roomMessages: CollaborationMessage[];
	fileTransfers: FileTransfer[];
} & RoomInfo;

export type FileTransfer = { id: string; name: string; size: number; peer: string; direction: 'incoming' | 'outgoing'; state: 'offered' | 'transferring' | 'complete' | 'rejected' | 'failed'; transferred: number; url?: string };

interface ClientStream {
    id: string;
    peer_id: string;
    stream: MediaStream;
    kind: 'media' | 'voice';
}

export interface UseRoom {
    state: RoomState;
    room: FCreateRoom;
    share: () => void;
    startPlayback: (media: MediaStream) => Promise<void>;
    startCamera: () => void;
	startMicrophone: () => void;
	toggleMicrophone: () => void;
    leaveRoom: () => void;
    connectionStatus: ConnectionStatus;
    setName: (name: string) => void;
    stopShare: () => void;
    stopPlayback: () => void;
	sendRoomMessage: (kind: CollaborationMessage['kind'], data: unknown, to?: string[]) => void;
	setMediaSeat: (active: boolean) => void;
	admin: (payload: {action: 'lock'; locked: boolean} | {action: 'kick'; target: string} | {action: 'media'; target: string; mediaEnabled: boolean}) => void;
	offerFile: (file: File, recipients: string[]) => void;
	acceptFile: (id: string) => void;
	rejectFile: (id: string) => void;
}

const relayConfig: Partial<RTCConfiguration> =
    window.location.search.indexOf('forceTurn=true') !== -1 ? {iceTransportPolicy: 'relay'} : {};

const hostSession = async ({
    sid,
	peerID,
	kind,
    ice,
    send,
    done,
    stream,
	onDataChannel,
    onPeer,
}: {
    sid: string;
	peerID: string;
	kind: 'data' | 'media' | 'voice';
    ice: ICEServer[];
    send: (e: OutgoingMessage) => void;
    done: () => void;
    stream: MediaStream;
	onDataChannel: (peerID: string, channel: RTCDataChannel) => void;
    onPeer: (peer: RTCPeerConnection) => void;
}): Promise<RTCPeerConnection> => {
    const peer = new RTCPeerConnection({...relayConfig, iceServers: ice});
    onPeer(peer);
    peer.onicecandidate = (event) => {
        if (!event.candidate) {
            return;
        }
        send({type: 'hostice', payload: {sid: sid, value: event.candidate}});
    };

    peer.onconnectionstatechange = (event) => {
        console.log('host change', event);
        if (peer.connectionState === 'closed' || peer.connectionState === 'failed') {
            peer.close();
            done();
        }
    };

	if (kind !== 'data') stream.getTracks().forEach((track) => peer.addTrack(track, stream));
	if (kind === 'data') onDataChannel(peerID, peer.createDataChannel('peerloom-data', {ordered: true}));

    const preferCodec = resolveCodecPlaceholder(loadSettings().preferCodec);
    if (preferCodec) {
        const transceiver = peer
            .getTransceivers()
            .find((t) => t.sender && t.sender.track === stream.getVideoTracks()[0]);

        if (!!transceiver && 'setCodecPreferences' in transceiver) {
            const exactMatch: RTCRtpCodec[] = [];
            const mimeMatch: RTCRtpCodec[] = [];
            const others: RTCRtpCodec[] = [];

            RTCRtpReceiver.getCapabilities('video')?.codecs.forEach((codec) => {
                if (codec.mimeType === preferCodec.mimeType) {
                    if (codec.sdpFmtpLine === preferCodec.sdpFmtpLine) {
                        exactMatch.push(codec);
                    } else {
                        mimeMatch.push(codec);
                    }
                } else {
                    others.push(codec);
                }
            });

            const sortedCodecs = [...exactMatch, ...mimeMatch, ...others];

            console.log('Setting codec preferences', sortedCodecs);
            transceiver.setCodecPreferences(sortedCodecs);
        }
    }

    const hostOffer = await peer.createOffer({offerToReceiveVideo: true});
    await peer.setLocalDescription(hostOffer);
    send({type: 'hostoffer', payload: {value: hostOffer, sid: sid}});

    return peer;
};

const clientSession = async ({
    sid,
	peerID,
	kind,
    ice,
    send,
    done,
    onTrack,
	onDataChannel,
    onPeer,
}: {
    sid: string;
	peerID: string;
	kind: 'data' | 'media' | 'voice';
    ice: ICEServer[];
    send: (e: OutgoingMessage) => void;
    onTrack: (s: MediaStream) => void;
    done: () => void;
	onDataChannel: (peerID: string, channel: RTCDataChannel) => void;
    onPeer: (peer: RTCPeerConnection) => void;
}): Promise<RTCPeerConnection> => {
    console.log('ice', ice);
    const peer = new RTCPeerConnection({...relayConfig, iceServers: ice});
    onPeer(peer);
    peer.onicecandidate = (event) => {
        if (!event.candidate) {
            return;
        }
        send({type: 'clientice', payload: {sid: sid, value: event.candidate}});
    };
    peer.onconnectionstatechange = (event) => {
        console.log('client change', event);
        if (peer.connectionState === 'closed' || peer.connectionState === 'failed') {
            peer.close();
            done();
        }
    };

    peer.ondatachannel = (event) => {
        if (kind === 'data' && event.channel.label === 'peerloom-data') onDataChannel(peerID, event.channel);
    };
    let notified = false;
    const stream = new MediaStream();
    peer.ontrack = (event) => {
        stream.addTrack(event.track);
        if (!notified) {
            notified = true;
            onTrack(stream);
        }
    };

    return peer;
};

export type FCreateRoom = (room: RoomCreate | JoinRoom) => Promise<void>;

export const useRoom = (config: UIConfig): UseRoom => {
    const [roomID, setRoomID] = useRoomID();
    const {enqueueSnackbar} = useSnackbar();
    const conn = React.useRef<WebSocket | undefined>(undefined);
    const host = React.useRef<Record<string, RTCPeerConnection>>({});
    const client = React.useRef<Record<string, RTCPeerConnection>>({});
    const stream = React.useRef<MediaStream>(undefined);
    const voiceStream = React.useRef<MediaStream>(undefined);
    const roomInfo = React.useRef<RoomInfo | undefined>(undefined);
    const epoch = React.useRef(0);
    const retryTimers = React.useRef<Record<string, number>>({});
    const retryAttempts = React.useRef<Record<string, number>>({});
    const downloadURLs = React.useRef(new Set<string>());
    const contentGeneration = React.useRef(0);
    const voiceGeneration = React.useRef(0);
    const contentStarting = React.useRef(false);
    const voiceStarting = React.useRef(false);
    const playbackPending = React.useRef<{resolve: () => void; reject: (error: Error) => void} | undefined>(undefined);
	const microphone = React.useRef<MediaStreamTrack | undefined>(undefined);
	const leaving = React.useRef(false);
    const members = React.useRef(new Set<string>());
    const sessionKinds = React.useRef<Record<string, 'data' | 'media' | 'voice'>>({});
	const peerUsers = React.useRef<Record<string, string>>({});
	const previousDataStats = React.useRef({sent: 0, received: 0, at: 0});
	const previousMediaStats = React.useRef<Record<string, {sent: number; received: number; at: number}>>({});
	const dataChannels = React.useRef<Record<string, RTCDataChannel>>({});
	const fileRuntime = React.useRef<Map<string, {file?: File; peer?: string; chunks: BlobPart[]; writer?: any; fileHandle?: any; write: Promise<void>; sent: Map<number, {data: ArrayBuffer; hash: string}>; retries: Map<number, number>; acknowledged: number; total: number; endSent: boolean}>>(new Map());
	const handleDataMessage = React.useRef<(peerID: string, event: MessageEvent) => void>(() => {});
	const pendingFrames = React.useRef<Record<string, {id: string; index: number; hash: string}>>({});
	const resumeTransfers = React.useRef<(peer: string) => void>(() => {});
	const myID = React.useRef('');

    const scheduleReconnect = (peerID: string, sid: string, generation: number) => {
        if (retryTimers.current[peerID] || generation !== epoch.current || leaving.current || !members.current.has(peerID)) return;
        const attempt = retryAttempts.current[peerID] ?? 0;
        if (attempt >= 6) { enqueueSnackbar('数据连接恢复失败，请退出并重新加入房间。', {variant: 'warning'}); return; }
        retryAttempts.current[peerID] = attempt + 1;
        retryTimers.current[peerID] = window.setTimeout(() => {
            delete retryTimers.current[peerID];
            if (generation !== epoch.current || leaving.current || !members.current.has(peerID) || dataChannels.current[peerID]?.readyState === 'open') return;
            if (conn.current?.readyState === WebSocket.OPEN) conn.current.send(JSON.stringify({type: 'datareconnect', payload: {target: peerID, sid}}));
        }, Math.min(5000 * 2 ** attempt, 30000));
    };

    const registerDataChannel = (peerID: string, channel: RTCDataChannel, sid: string, generation: number) => {
        if (generation !== epoch.current || !sessionKinds.current[sid] || leaving.current) { channel.close(); return; }
        const previous = dataChannels.current[peerID];
        if (previous && previous !== channel) { previous.onclose = null; previous.close(); }
        channel.binaryType = 'arraybuffer';
        channel.onclose = () => {
            if (generation !== epoch.current) return;
            if (dataChannels.current[peerID] === channel) delete dataChannels.current[peerID];
            scheduleReconnect(peerID, sid, generation);
        };
        channel.onmessage = (event) => { if (generation === epoch.current) handleDataMessage.current(peerID, event); };
        channel.onopen = () => {
            if (generation !== epoch.current) { channel.close(); return; }
            window.clearTimeout(retryTimers.current[peerID]); delete retryTimers.current[peerID]; delete retryAttempts.current[peerID];
            resumeTransfers.current(peerID);
        };
        dataChannels.current[peerID] = channel;
        // A negotiation can stall without an onclose event.
        scheduleReconnect(peerID, sid, generation);
    };

    const [state, setState] = React.useState<RoomState>(false);
    const [connectionStatus, setConnectionStatus] = React.useState<ConnectionStatus>({websocketState: 'connecting', peers: [], dataChannelSentBytes: 0, dataChannelReceivedBytes: 0, dataChannelUploadBps: 0, dataChannelDownloadBps: 0, sampledAt: Date.now()});

    React.useEffect(() => {
        let disposed = false;
        let lastServerProbe = 0;
        let serverLatencyMs: number | undefined;
        const sample = async () => {
            const now = performance.now();
            if (now - lastServerProbe > 10_000) {
                lastServerProbe = now;
                try {
                    const started = performance.now();
                    await fetch(urlWithSlash, {cache: 'no-store', method: 'HEAD'});
                    serverLatencyMs = Math.round(performance.now() - started);
                } catch { serverLatencyMs = undefined; }
            }
            const peers: PeerConnectionStatus[] = [];
            let dataChannelSentBytes = 0;
            let dataChannelReceivedBytes = 0;
            for (const [id, peer] of [...Object.entries(host.current), ...Object.entries(client.current)]) {
                const stats = await peer.getStats();
                let pair: any;
                let mediaSent = 0;
                let mediaReceived = 0;
                let receivedPackets = 0;
                let lostPackets = 0;
                const candidates = new Map<string, any>();
                stats.forEach((report: any) => {
                    if (report.type === 'local-candidate') candidates.set(report.id, report);
                    if (report.type === 'candidate-pair' && (report.selected || (report.nominated && report.state === 'succeeded'))) pair = report;
                    if (report.type === 'data-channel') { dataChannelSentBytes += report.bytesSent ?? 0; dataChannelReceivedBytes += report.bytesReceived ?? 0; }
                    if (report.type === 'outbound-rtp' && !report.isRemote) mediaSent += report.bytesSent ?? 0;
                    if (report.type === 'inbound-rtp' && !report.isRemote) { mediaReceived += report.bytesReceived ?? 0; receivedPackets += report.packetsReceived ?? 0; lostPackets += report.packetsLost ?? 0; }
                    if (report.type === 'remote-inbound-rtp') { receivedPackets += report.packetsReceived ?? 0; lostPackets += report.packetsLost ?? 0; }
                });
                const candidate = pair ? candidates.get(pair.localCandidateId) : undefined;
                const previousMedia = previousMediaStats.current[id];
                const mediaElapsed = previousMedia?.at ? (Date.now() - previousMedia.at) / 1000 : 0;
                previousMediaStats.current[id] = {sent: mediaSent, received: mediaReceived, at: Date.now()};
                peers.push({id, peerID: peerUsers.current[id] ?? '', connectionState: peer.connectionState, iceState: peer.iceConnectionState, route: candidate?.candidateType === 'relay' ? 'turn' : candidate ? 'direct' : 'unknown', rttMs: typeof pair?.currentRoundTripTime === 'number' ? Math.round(pair.currentRoundTripTime * 1000) : undefined, dataChannelState: dataChannels.current[peerUsers.current[id] ?? '']?.readyState, uploadBps: mediaElapsed ? Math.max(0, (mediaSent - previousMedia.sent) / mediaElapsed) : 0, downloadBps: mediaElapsed ? Math.max(0, (mediaReceived - previousMedia.received) / mediaElapsed) : 0, packetLossRate: receivedPackets + lostPackets ? lostPackets / (receivedPackets + lostPackets) : undefined});
            }
            const previous = previousDataStats.current;
            const elapsedSeconds = previous.at ? (Date.now() - previous.at) / 1000 : 0;
            previousDataStats.current = {sent: dataChannelSentBytes, received: dataChannelReceivedBytes, at: Date.now()};
            if (!disposed) setConnectionStatus({serverLatencyMs, websocketState: conn.current ? ['connecting', 'open', 'closing', 'closed'][conn.current.readyState] : 'closed', peers, dataChannelSentBytes, dataChannelReceivedBytes, dataChannelUploadBps: elapsedSeconds ? Math.max(0, (dataChannelSentBytes - previous.sent) / elapsedSeconds) : 0, dataChannelDownloadBps: elapsedSeconds ? Math.max(0, (dataChannelReceivedBytes - previous.received) / elapsedSeconds) : 0, sampledAt: Date.now()});
        };
        void sample();
        const interval = window.setInterval(() => void sample(), 1000);
        return () => { disposed = true; window.clearInterval(interval); };
    }, []);

    const clearLocalMedia = (kind: 'media' | 'voice' = 'media') => {
        if (kind === 'media') { contentGeneration.current++; contentStarting.current = false; }
        else { voiceGeneration.current++; voiceStarting.current = false; }
        for (const [sid, peer] of Object.entries(host.current)) {
            if (sessionKinds.current[sid] !== kind) continue;
            peer.close();
            delete host.current[sid];
            delete sessionKinds.current[sid];
        }
        if (kind === 'voice') {
            voiceStream.current?.getTracks().forEach((track) => track.stop());
            voiceStream.current = undefined;
            microphone.current = undefined;
            setState((current) => current ? {...current, microphoneActive: false, microphoneMuted: false} : current);
        } else {
            stream.current?.getTracks().forEach((track) => track.stop());
            stream.current = undefined;
            playbackPending.current?.reject(new Error('同播已停止或未获准开始'));
            playbackPending.current = undefined;
            setState((current) => current ? {...current, hostStream: undefined} : current);
        }
    };

    const cleanupRoom = () => {
        epoch.current++;
        leaving.current = true;
        const socket = conn.current;
        conn.current = undefined;
        members.current.clear(); roomInfo.current = undefined;
        Object.values(retryTimers.current).forEach((timer) => window.clearTimeout(timer));
        retryTimers.current = {}; retryAttempts.current = {};
        clearLocalMedia(); clearLocalMedia('voice');
        Object.values(dataChannels.current).forEach((channel) => { channel.onclose = null; channel.onmessage = null; channel.onopen = null; channel.close(); });
        dataChannels.current = {};
        [...Object.values(host.current), ...Object.values(client.current)].forEach((peer) => {
            peer.onconnectionstatechange = null; peer.onicecandidate = null; peer.ontrack = null; peer.ondatachannel = null; peer.close();
        });
        host.current = {}; client.current = {}; sessionKinds.current = {}; peerUsers.current = {};
        for (const runtime of fileRuntime.current.values()) {
            void runtime.write.catch(() => {}).then(() => runtime.writer?.abort?.()).catch(() => {});
        }
        fileRuntime.current.clear(); pendingFrames.current = {};
        downloadURLs.current.forEach((url) => URL.revokeObjectURL(url)); downloadURLs.current.clear();
        previousMediaStats.current = {}; previousDataStats.current = {sent: 0, received: 0, at: 0};
        socket?.close(1000, 'left room');
    };
    React.useEffect(() => cleanupRoom, []);

    const room: FCreateRoom = React.useCallback(
        (create) => {
            return new Promise<void>((resolve) => {
                cleanupRoom();
                const generation = epoch.current;
                leaving.current = false;
                const ws = (conn.current = new WebSocket(
                    urlWithSlash.replace('http', 'ws') + 'stream'
                ));
                const send = (message: OutgoingMessage) => {
                    if (generation === epoch.current && ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
                };
                let first = true;
                ws.onmessage = (data) => {
                    if (generation !== epoch.current) return;
                    const event: IncomingMessage = JSON.parse(data.data);
                    if (event.type === 'room') {
 roomInfo.current = event.payload;
 members.current = new Set(event.payload.users.map((user) => user.id));
 }
                    if (first) {
                        first = false;
                        if (event.type === 'room') {
                            resolve();
							myID.current = event.payload.users.find((user) => user.you)?.id ?? '';
							setState({ws, ...event.payload, microphoneActive: false, microphoneMuted: false, clientStreams: [], roomMessages: [], fileTransfers: []});
                            setRoomID(event.payload.id);
                        } else {
                            resolve();
                            enqueueSnackbar(`${i18n['unknown_event']}: ${event.type}`, {variant: 'error'});
                            ws.close(1000, i18n['received_unknown_event']);
                        }
                        return;
                    }

                    switch (event.type) {
                        case 'error':
                            enqueueSnackbar(event.payload.message, {variant: 'error'});
                            if (event.payload.operation === 'share') clearLocalMedia();
                            if (event.payload.operation === 'voice') clearLocalMedia('voice');
                            return;
                        case 'room':
                            const me = event.payload.users.find((user) => user.you);
                            if (!me?.mediaActive || !me.mediaEnabled) clearLocalMedia();
                            if (!me?.mediaEnabled) clearLocalMedia('voice');
                            if (me?.streaming && event.payload.playback?.from === me.id) { playbackPending.current?.resolve(); playbackPending.current = undefined; }
                            setState((current) =>
                                current ? {...current, ...event.payload} : current
                            );
                            return;
                        case 'hostsession':
                            const source = event.payload.kind === 'voice' ? voiceStream.current : stream.current;
                            if (event.payload.kind !== 'data' && !source) {
                                return;
                            }
                            sessionKinds.current[event.payload.id] = event.payload.kind;
                            peerUsers.current[event.payload.id] = event.payload.peer;
                            hostSession({
                                onPeer: (peer) => { host.current[event.payload.id] = peer; },
                                sid: event.payload.id,
								peerID: event.payload.peer,
								kind: event.payload.kind,
								stream: source ?? new MediaStream(),
                                ice: event.payload.iceServers,
                                send,
								onDataChannel: (peerID, channel) => registerDataChannel(peerID, channel, event.payload.id, generation),
                                done: () => { if (generation === epoch.current) delete host.current[event.payload.id]; },
                            }).then((peer) => {
                                if (generation !== epoch.current || !sessionKinds.current[event.payload.id] || event.payload.kind !== 'data' && source !== (event.payload.kind === 'voice' ? voiceStream.current : stream.current)) {
                                    peer.close();
                                    delete sessionKinds.current[event.payload.id];
                                    return;
                                }
                                peerUsers.current[event.payload.id] = event.payload.peer;
                                host.current[event.payload.id] = peer;
                            }).catch(() => { if (generation === epoch.current && sessionKinds.current[event.payload.id]) enqueueSnackbar('媒体连接建立失败，请结束共享后重试。', {variant: 'warning'}); });
                            return;
                        case 'clientsession':
                            const {id: sid, peer} = event.payload;
                            sessionKinds.current[sid] = event.payload.kind;
                            peerUsers.current[sid] = peer;
                            clientSession({
                                onPeer: (connection) => { client.current[sid] = connection; },
                                sid,
								peerID: peer,
								kind: event.payload.kind,
                                send,
                                ice: event.payload.iceServers,
                                done: () => {
                                    if (generation !== epoch.current) return;
                                    delete client.current[sid];
									delete peerUsers.current[sid];
                                    setState((current) =>
                                        current
                                            ? {
                                                  ...current,
                                                  clientStreams: current.clientStreams.filter(
                                                      ({id}) => id !== sid
                                                  ),
                                              }
                                            : current
                                    );
                                },
                                onTrack: (stream) =>
                                    generation === epoch.current && Boolean(sessionKinds.current[sid]) && setState((current) =>
                                        current
                                            ? {
                                                  ...current,
                                                  clientStreams: [
                                                      ...current.clientStreams,
                                                      {
                                                          id: sid,
                                                          stream,
                                                          peer_id: peer,
                                                          kind: event.payload.kind === 'voice' ? 'voice' : 'media',
                                                      },
                                                  ],
                                              }
                                            : current
                                    ),
								onDataChannel: (peerID, channel) => registerDataChannel(peerID, channel, event.payload.id, generation),
							}).then((connection) => { if (generation !== epoch.current || !sessionKinds.current[sid]) { connection.close(); return; } peerUsers.current[event.payload.id] = peer; client.current[event.payload.id] = connection; });
                            return;
                        case 'clientice':
                            host.current[event.payload.sid]?.addIceCandidate(event.payload.value);
                            return;
                        case 'clientanswer':
                            host.current[event.payload.sid]?.setRemoteDescription(
                                event.payload.value
                            );
                            return;
                        case 'hostoffer':
                            (async () => {
                                await client.current[event.payload.sid]?.setRemoteDescription(
                                    event.payload.value
                                );
                                const answer =
                                    await client.current[event.payload.sid]?.createAnswer();
                                await client.current[event.payload.sid]?.setLocalDescription(
                                    answer
                                );
                                send({
                                    type: 'clientanswer',
                                    payload: {sid: event.payload.sid, value: answer},
                                });
                            })();
                            return;
                        case 'hostice':
                            client.current[event.payload.sid]?.addIceCandidate(event.payload.value);
                            return;
                        case 'endshare':
                            // Server-directed closure is intentional; never reconnect it.
                            const peerID = peerUsers.current[event.payload];
                            if (sessionKinds.current[event.payload] === 'data' && dataChannels.current[peerID]) {
                                dataChannels.current[peerID].onclose = null;
                                dataChannels.current[peerID].close();
                                delete dataChannels.current[peerID];
                            }
                            delete sessionKinds.current[event.payload];
                            window.clearTimeout(retryTimers.current[peerID]); delete retryTimers.current[peerID];
                            client.current[event.payload]?.close();
                            host.current[event.payload]?.close();
                            delete host.current[event.payload]; delete client.current[event.payload]; delete peerUsers.current[event.payload];
                            setState((current) =>
                                current
                                    ? {
                                          ...current,
                                          clientStreams: current.clientStreams.filter(
                                              ({id}) => id !== event.payload
                                          ),
                                      }
                                    : current
                            );
							return;
						case 'roommessage':
							if (event.payload.kind === 'file-offer' && event.payload.from !== myID.current) {
								const value = event.payload.data as {id?: string; name?: string; size?: number};
								if (value.id && value.name && typeof value.size === 'number') {
									const incoming: FileTransfer = {id: value.id, name: value.name, size: value.size, peer: event.payload.from, direction: 'incoming', state: 'offered', transferred: 0};
									setState((current) => !current || current.fileTransfers.some((file) => file.id === incoming.id) ? current : {...current, fileTransfers: [...current.fileTransfers, incoming]});
								}
							}
							if (event.payload.kind === 'file-response' && event.payload.from !== myID.current) {
								const value = event.payload.data as {id?: string; accepted?: boolean};
								if (value.id) handleFileResponse(value.id, event.payload.from, value.accepted === true);
							}
							setState((current) => current ? {...current, roomMessages: [...current.roomMessages.slice(-199), event.payload]} : current);
							return;
                    }
                };
                ws.onclose = (event) => {
                    resolve();
                    if (generation !== epoch.current) return;
                    const reason = event.reason || '连接已断开，请重新加入房间。';
                    if (!leaving.current) enqueueSnackbar(reason, {variant: 'error', persist: true});
                    cleanupRoom(); setState(false);
                };
                ws.onerror = () => {
                    resolve();
                    if (generation !== epoch.current) return;
                    enqueueSnackbar('无法连接房间服务器，请检查网络后重新加入。', {variant: 'error', persist: true});
                    cleanupRoom(); setState(false);
                };
                ws.onopen = () => {
                    if (generation !== epoch.current) return;
                    create.payload.username = loadSettings().name;
                    send(create);
                };
            });
        },
        [setState, enqueueSnackbar, setRoomID]
    );

    const mediaProblem = (content: boolean) => {
        const info = roomInfo.current;
        const me = info?.users.find((user) => user.you);
        if (leaving.current || conn.current?.readyState !== WebSocket.OPEN) return '房间连接已断开，请重新加入。';
        if (!me?.mediaEnabled) return '房主已关闭你的媒体权限。';
        if (content && !me.mediaActive) return `请先进入媒体区；最多 ${info?.maxMediaSeats ?? '未知'} 人，席位满时需等待成员退出。`;
        if (content && stream.current) return '请先结束当前屏幕共享、摄像头或同播，再开始新的内容共享。';
        return '';
    };

    const stopShare = () => {
        clearLocalMedia();
        if (conn.current?.readyState === WebSocket.OPEN) conn.current.send(JSON.stringify({type: 'stopshare', payload: {}}));
    };

    const startMicrophone = async () => {
        if (voiceStream.current || voiceStarting.current) return;
        const problem = mediaProblem(false);
        if (problem) { enqueueSnackbar(problem, {variant: 'warning'}); return; }
        if (!navigator.mediaDevices?.getUserMedia) { enqueueSnackbar('当前浏览器无法访问麦克风，请使用 HTTPS。', {variant: 'error'}); return; }
        voiceStarting.current = true;
        const generation = voiceGeneration.current;
        try {
            const media = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true}});
            if (generation !== voiceGeneration.current || mediaProblem(false)) { media.getTracks().forEach((track) => track.stop()); return; }
            voiceStream.current = media;
            microphone.current = media.getAudioTracks()[0];
            microphone.current?.addEventListener('ended', () => {
                clearLocalMedia('voice');
                if (conn.current?.readyState === WebSocket.OPEN) conn.current.send(JSON.stringify({type: 'stopshare', payload: {kind: 'voice'}}));
            });
            setState((current) => current ? {...current, microphoneActive: true, microphoneMuted: false} : current);
            conn.current?.send(JSON.stringify({type: 'share', payload: {kind: 'voice'}}));
        } catch (error) {
            enqueueSnackbar(`无法开启麦克风：${error}。可以重新点击麦克风按钮重试。`, {variant: 'error'});
        } finally { if (generation === voiceGeneration.current) voiceStarting.current = false; }
    };

    const toggleMicrophone = () => {
        if (!microphone.current) { void startMicrophone(); return; }
        microphone.current.enabled = !microphone.current.enabled;
        setState((current) => current ? {...current, microphoneMuted: !microphone.current!.enabled} : current);
    };

    const captureContent = async (screen: boolean) => {
        if (contentStarting.current) return;
        const problem = mediaProblem(true);
        if (problem) { enqueueSnackbar(problem, {variant: 'warning'}); return; }
        if (!navigator.mediaDevices || (screen && !navigator.mediaDevices.getDisplayMedia)) {
            enqueueSnackbar('当前浏览器无法进行此共享，请使用支持该功能的浏览器并通过 HTTPS 访问。', {variant: 'error'}); return;
        }
        const generation = contentGeneration.current;
        contentStarting.current = true;
        try {
            const media = screen
                ? await navigator.mediaDevices.getDisplayMedia({video: {frameRate: loadSettings().framerate}, audio: true})
                : await navigator.mediaDevices.getUserMedia({video: true, audio: false});
            const problem = mediaProblem(true);
            if (generation !== contentGeneration.current || problem) {
                media.getTracks().forEach((track) => track.stop());
                if (problem) enqueueSnackbar(problem, {variant: 'warning'});
                return;
            }
            stream.current = media;
            media.getVideoTracks()[0]?.addEventListener('ended', stopShare);
            setState((current) => current ? {...current, hostStream: media} : current);
            conn.current?.send(JSON.stringify({type: 'share', payload: {}}));
            void startMicrophone();
        } catch (error) { enqueueSnackbar(`无法开始共享：${error}`, {variant: 'error'}); }
        finally { if (generation === contentGeneration.current) contentStarting.current = false; }
    };
    const share = () => void captureContent(true);
    const startCamera = () => void captureContent(false);

    const startPlayback = async (media: MediaStream) => {
        const problem = mediaProblem(true) || (roomInfo.current?.playback ? '已有成员正在同播，请等待其结束。' : '');
        if (problem || contentStarting.current) {
            media.getTracks().forEach((track) => track.stop());
            throw new Error(problem || '正在开始其他内容共享，请稍候。');
        }
        stream.current = media;
        setState((current) => current ? {...current, hostStream: media} : current);
        await new Promise<void>((resolve, reject) => {
            const timer = window.setTimeout(() => { stopShare(); reject(new Error('同播启动超时，请重试。')); }, 10000);
            playbackPending.current = {
                resolve: () => { window.clearTimeout(timer); resolve(); },
                reject: (error) => { window.clearTimeout(timer); reject(error); },
            };
            conn.current?.send(JSON.stringify({type: 'share', payload: {playback: true}}));
        });
    };
    const stopPlayback = stopShare;

    const leaveRoom = () => {
        cleanupRoom();
        setRoomID(undefined); setState(false);
    };

    const setName = (name: string): void => {
        conn.current?.send(JSON.stringify({type: 'name', payload: {username: name}}));
    };

	const sendRoomMessage = React.useCallback((kind: CollaborationMessage['kind'], data: unknown, to?: string[]) => {
		conn.current?.send(JSON.stringify({type: 'roommessage', payload: {kind, data, to}}));
	}, []);
	const updateFile = (id: string, update: Partial<FileTransfer>) => setState((current) => current ? {...current, fileTransfers: current.fileTransfers.map((file) => file.id === id ? {...file, ...update} : file)} : current);
	const hash = async (data: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), (byte) => byte.toString(16).padStart(2, '0')).join('');
	const sendBlock = (channel: RTCDataChannel, id: string, index: number, block: {data: ArrayBuffer; hash: string}) => {
		channel.send(`PEERLOOM_FILE_CHUNK:${JSON.stringify({id, index, hash: block.hash})}`);
		channel.send(block.data);
	};
	const finishOutgoing = (id: string, peer: string) => {
		const runtime = fileRuntime.current.get(id);
		const channel = dataChannels.current[peer];
		if (!runtime || !channel || channel.readyState !== 'open' || !runtime.endSent || runtime.sent.size) return;
		channel.send(`PEERLOOM_FILE_END:${id}`);
		updateFile(id, {state: 'complete', transferred: runtime.acknowledged});
	};
	const sendChunks = async (id: string, peer: string) => {
		const runtime = fileRuntime.current.get(id);
		const channel = dataChannels.current[peer];
		if (!runtime?.file || !channel || channel.readyState !== 'open') { updateFile(id, {state: 'failed'}); return; }
		const generation = epoch.current;
        const active = () => generation === epoch.current && fileRuntime.current.get(id) === runtime && channel.readyState === 'open';
		const file = runtime.file;
		runtime.total = Math.ceil(file.size / (64 * 1024));
		runtime.endSent = false;
		channel.send(`PEERLOOM_FILE_META:${JSON.stringify({id, name: file.name, size: file.size, type: file.type, total: runtime.total})}`);
		for (let offset = 0, index = 0; offset < file.size; offset += 64 * 1024, index += 1) {
			while (channel.bufferedAmount > 1024 * 1024 && active()) await new Promise((resolve) => window.setTimeout(resolve, 20));
            if (!active()) { if (generation === epoch.current) updateFile(id, {state: 'failed'}); return; }
			const data = await file.slice(offset, Math.min(offset + 64 * 1024, file.size)).arrayBuffer();
			const block = {data, hash: await hash(data)};
            if (!active()) { if (generation === epoch.current) updateFile(id, {state: 'failed'}); return; }
			runtime.sent.set(index, block);
			sendBlock(channel, id, index, block);
			updateFile(id, {state: 'transferring'});
		}
		runtime.endSent = true;
		finishOutgoing(id, peer);
	};
	resumeTransfers.current = (peer) => {
		const channel = dataChannels.current[peer];
		if (!channel || channel.readyState !== 'open') return;
		for (const [id, runtime] of fileRuntime.current) {
			if (!runtime.file || runtime.peer !== peer || !runtime.sent.size) continue;
			for (const [index, block] of runtime.sent) sendBlock(channel, id, index, block);
		}
	};
	const handleFileResponse = (id: string, peer: string, accepted: boolean) => {
		if (!accepted) { updateFile(id, {state: 'rejected'}); return; }
		void sendChunks(id, peer).catch(() => updateFile(id, {state: 'failed'}));
	};
	const offerFile = (file: File, recipients: string[]) => {
		if (file.size > 500 * 1024 * 1024 || recipients.length === 0) return;
		for (const peer of recipients.slice(0, 11)) {
			const id = crypto.randomUUID();
			fileRuntime.current.set(id, {file, peer, chunks: [], write: Promise.resolve(), sent: new Map(), retries: new Map(), acknowledged: 0, total: 0, endSent: false});
			setState((current) => current ? {...current, fileTransfers: [...current.fileTransfers, {id, name: file.name, size: file.size, peer, direction: 'outgoing', state: 'offered', transferred: 0}]} : current);
			sendRoomMessage('file-offer', {id, name: file.name, size: file.size, type: file.type}, [peer]);
		}
	};
	const acceptFile = (id: string) => {
		setState((current) => {
			if (!current) return current;
			const file = current.fileTransfers.find((item) => item.id === id);
			if (file) sendRoomMessage('file-response', {id, accepted: true}, [file.peer]);
			return {...current, fileTransfers: current.fileTransfers.map((item) => item.id === id ? {...item, state: 'transferring'} : item)};
		});
	};
	const rejectFile = (id: string) => setState((current) => {
		if (!current) return current;
		const file = current.fileTransfers.find((item) => item.id === id);
		if (file) sendRoomMessage('file-response', {id, accepted: false}, [file.peer]);
		return {...current, fileTransfers: current.fileTransfers.map((item) => item.id === id ? {...item, state: 'rejected'} : item)};
	});
	handleDataMessage.current = (peer, event) => {
        const generation = epoch.current;
		if (typeof event.data === 'string' && event.data.startsWith('PEERLOOM_FILE_META:')) {
			const meta = JSON.parse(event.data.slice('PEERLOOM_FILE_META:'.length)) as {id: string; name?: string};
			const runtime = {peer, chunks: [] as BlobPart[], write: Promise.resolve(), sent: new Map(), retries: new Map(), acknowledged: 0, total: 0, endSent: false} as {peer: string; chunks: BlobPart[]; writer?: any; fileHandle?: any; write: Promise<void>; sent: Map<number, {data: ArrayBuffer; hash: string}>; retries: Map<number, number>; acknowledged: number; total: number; endSent: boolean};
			// OPFS keeps a large incoming file off the JS heap. Browsers without it
			// retain the small-file fallback so the transfer protocol still works.
			if (navigator.storage?.getDirectory) runtime.write = navigator.storage.getDirectory().then(async (root) => {
				const safeName = (meta.name || meta.id).replace(/[^a-zA-Z0-9._-]/g, '_');
				runtime.fileHandle = await root.getFileHandle(`peerloom-${meta.id}-${safeName}`, {create: true});
				runtime.writer = await runtime.fileHandle.createWritable();
			}).catch(() => undefined);
			fileRuntime.current.set(meta.id, runtime);
			return;
		}
		if (typeof event.data === 'string' && event.data.startsWith('PEERLOOM_FILE_CHUNK:')) {
			const frame = JSON.parse(event.data.slice('PEERLOOM_FILE_CHUNK:'.length)) as {id: string; index: number; hash: string};
			if (frame.id && Number.isInteger(frame.index) && frame.hash) pendingFrames.current[peer] = frame;
			return;
		}
		if (typeof event.data === 'string' && event.data.startsWith('PEERLOOM_FILE_ACK:')) {
			const frame = JSON.parse(event.data.slice('PEERLOOM_FILE_ACK:'.length)) as {id: string; index: number};
			const runtime = fileRuntime.current.get(frame.id);
			const block = runtime?.sent.get(frame.index);
			if (runtime && block) { runtime.sent.delete(frame.index); runtime.acknowledged += block.data.byteLength; updateFile(frame.id, {transferred: runtime.acknowledged}); finishOutgoing(frame.id, peer); }
			return;
		}
		if (typeof event.data === 'string' && event.data.startsWith('PEERLOOM_FILE_NACK:')) {
			const frame = JSON.parse(event.data.slice('PEERLOOM_FILE_NACK:'.length)) as {id: string; index: number};
			const runtime = fileRuntime.current.get(frame.id);
			const block = runtime?.sent.get(frame.index);
			const retries = (runtime?.retries.get(frame.index) ?? 0) + 1;
			if (!runtime || !block || retries > 3) { updateFile(frame.id, {state: 'failed'}); return; }
			runtime.retries.set(frame.index, retries);
			const channel = dataChannels.current[peer];
			if (channel?.readyState === 'open') sendBlock(channel, frame.id, frame.index, block);
			return;
		}
		if (typeof event.data === 'string' && event.data.startsWith('PEERLOOM_FILE_END:')) {
			const id = event.data.slice('PEERLOOM_FILE_END:'.length);
			const runtime = fileRuntime.current.get(id);
			if (runtime) void runtime.write.then(async () => {
				if (runtime.writer) await runtime.writer.close();
				const blob = runtime.fileHandle ? await runtime.fileHandle.getFile() : new Blob(runtime.chunks);
                if (generation !== epoch.current) return;
				setState((current) => {
					if (!current) return current;
					const file = current.fileTransfers.find((item) => item.id === id);
					if (!file) return current;
					return {...current, fileTransfers: current.fileTransfers.map((item) => item.id === id ? {...item, state: 'complete', transferred: item.size, url: (() => { const url = URL.createObjectURL(blob); downloadURLs.current.add(url); return url; })()} : item)};
				});
			}).catch(() => updateFile(id, {state: 'failed'}));
			return;
		}
		if (event.data instanceof ArrayBuffer) {
			const frame = pendingFrames.current[peer];
			delete pendingFrames.current[peer];
			if (!frame) return;
			void (async () => {
				const channel = dataChannels.current[peer];
				if (await hash(event.data) !== frame.hash) { channel?.readyState === 'open' && channel.send(`PEERLOOM_FILE_NACK:${JSON.stringify({id: frame.id, index: frame.index})}`); return; }
				const runtime = fileRuntime.current.get(frame.id);
                if (generation !== epoch.current) return;
				if (!runtime) return;
				runtime.write = runtime.write.then(async () => {
					if (runtime.writer) await runtime.writer.write(event.data);
					else runtime.chunks.push(event.data);
				});
				try { await runtime.write; if (generation !== epoch.current) return; } catch { channel?.readyState === 'open' && channel.send(`PEERLOOM_FILE_NACK:${JSON.stringify({id: frame.id, index: frame.index})}`); return; }
				setState((current) => {
					if (!current) return current;
					const file = current.fileTransfers.find((item) => item.id === frame.id && item.peer === peer && item.direction === 'incoming' && item.state === 'transferring');
					if (!file) return current;
					return {...current, fileTransfers: current.fileTransfers.map((item) => item.id === file.id ? {...item, transferred: Math.min(item.size, item.transferred + event.data.byteLength)} : item)};
				});
				channel?.readyState === 'open' && channel.send(`PEERLOOM_FILE_ACK:${JSON.stringify({id: frame.id, index: frame.index})}`);
			})();
		}
	};
	const setMediaSeat = (active: boolean) => conn.current?.send(JSON.stringify({type: 'mediaseat', payload: {active}}));
	const admin: UseRoom['admin'] = (payload) => conn.current?.send(JSON.stringify({type: 'roomadmin', payload}));

    React.useEffect(() => {
        if (roomID) {
            const create = getFromURL('create') === 'true';
            if (create) {
                const closeOnOwnerLeaveString = getFromURL('closeOnOwnerLeave');
                const closeOnOwnerLeave =
                    closeOnOwnerLeaveString === undefined
                        ? config.closeRoomWhenOwnerLeaves
                        : closeOnOwnerLeaveString === 'true';
                room({
                    type: 'create',
                    payload: {
                        joinIfExist: true,
                        closeOnOwnerLeave,
                        id: roomID,
                        mode: authModeToRoomMode(config.authMode, config.loggedIn),
                    },
                });
            } else {
                room({type: 'join', payload: {id: roomID}});
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {state, room, share, startPlayback, startCamera, startMicrophone, toggleMicrophone, connectionStatus, stopShare, stopPlayback, leaveRoom, setName, sendRoomMessage, setMediaSeat, admin, offerFile, acceptFile, rejectFile};
};
