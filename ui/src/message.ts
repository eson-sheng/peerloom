export enum ShareMode {
    Everyone = 'Everyone',
    Selected = 'Selected',
}

type Typed<Base, Type extends string> = {type: Type; payload: Base};

export interface UIConfig {
    authMode: 'turn' | 'none' | 'all';
    createLoginRequired: boolean;
    user: string;
    loggedIn: boolean;
    version: string;
    roomName: string;
    closeRoomWhenOwnerLeaves: boolean;
}

export interface RoomConfiguration {
    id?: string;
    closeOnOwnerLeave?: boolean;
    mode: RoomMode;
    username?: string;
}

export enum RoomMode {
    Turn = 'turn',
    Stun = 'stun',
    Local = 'local',
}

export interface JoinConfiguration {
    id: string;
    password?: string;
    username?: string;
}

export interface StringMessage {
    message: string;
}

export interface P2PSession {
    id: string;
    peer: string;
	kind: 'data' | 'media' | 'voice';
    iceServers: ICEServer[];
}

export interface ICEServer {
    urls: string[];
    credential: string;
    username: string;
}

export interface PlaybackState {
    from: string;
    currentTime: number;
    duration: number;
    rate: number;
    paused: boolean;
    updatedAt: number;
}

export interface RoomInfo {
    playback?: PlaybackState | null;
    id: string;
    share: ShareMode;
    mode: RoomMode;
    users: RoomUser[];
	locked: boolean;
	maxMembers: number;
	maxMediaSeats: number;
}

export interface RoomUser {
    id: string;
    name: string;
    streaming: boolean;
    voiceActive: boolean;
    you: boolean;
    owner: boolean;
	mediaEnabled: boolean;
	mediaActive: boolean;
}

export interface CollaborationMessage {
	kind: 'chat' | 'typing' | 'link-status' | 'file-offer' | 'file-response' | 'file-cancel' | 'playback' | 'document-update' | 'whiteboard-update' | 'cursor';
	from: string;
	to?: string[];
	data: unknown;
	at: number;
}

export interface P2PMessage<T> {
    sid: string;
    value: T;
}

export type Room = Typed<RoomInfo, 'room'>;
export type Error = Typed<StringMessage & {operation?: string}, 'error'>;
export type HostSession = Typed<P2PSession, 'hostsession'>;
export type Name = Typed<{username: string}, 'name'>;
export type ClientSession = Typed<P2PSession, 'clientsession'>;
export type HostICECandidate = Typed<P2PMessage<RTCIceCandidate>, 'hostice'>;
export type ClientICECandidate = Typed<P2PMessage<RTCIceCandidate>, 'clientice'>;
export type HostOffer = Typed<P2PMessage<RTCSessionDescriptionInit>, 'hostoffer'>;
export type ClientAnswer = Typed<P2PMessage<RTCSessionDescriptionInit>, 'clientanswer'>;
export type StartSharing = Typed<{kind?: 'media' | 'voice'}, 'share'>;
export type StopShare = Typed<{kind?: 'media' | 'voice'}, 'stopshare'>;
export type RoomCreate = Typed<RoomConfiguration & {joinIfExist?: boolean}, 'create'>;
export type JoinRoom = Typed<JoinConfiguration, 'join'>;
export type EndShare = Typed<string, 'endshare'>;
export type RoomMessage = Typed<CollaborationMessage, 'roommessage'>;

export type IncomingMessage =
    | Room
    | Error
    | HostSession
    | ClientSession
    | HostICECandidate
    | ClientICECandidate
    | HostOffer
    | EndShare
    | ClientAnswer
    | RoomMessage;

export type OutgoingMessage =
    | RoomCreate
    | Name
    | JoinRoom
    | HostICECandidate
    | ClientICECandidate
    | HostOffer
    | StopShare
    | ClientAnswer
    | StartSharing
    | Typed<{kind: CollaborationMessage['kind']; to?: string[]; data: unknown}, 'roommessage'>
    | Typed<{active: boolean}, 'mediaseat'>
	| Typed<{target: string; sid: string}, 'datareconnect'>
    | Typed<{action: 'lock'; locked: boolean} | {action: 'kick'; target: string} | {action: 'media'; target: string; mediaEnabled: boolean}, 'roomadmin'>;
