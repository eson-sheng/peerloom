package outgoing

import (
	"encoding/json"

	"github.com/rs/xid"
)

type Message interface {
	Type() string
}

// OperationError reports a rejected operation without closing the room connection.
type OperationError struct {
	Message   string `json:"message"`
	Operation string `json:"operation,omitempty"`
}

func (OperationError) Type() string { return "error" }

type PlaybackState struct {
	From        xid.ID  `json:"from"`
	CurrentTime float64 `json:"currentTime"`
	Duration    float64 `json:"duration"`
	Rate        float64 `json:"rate"`
	Paused      bool    `json:"paused"`
	UpdatedAt   int64   `json:"updatedAt"`
}

type Room struct {
	ID            string         `json:"id"`
	Playback      *PlaybackState `json:"playback"`
	Mode          ConnectionMode `json:"mode"`
	Users         []User         `json:"users"`
	Locked        bool           `json:"locked"`
	MaxMembers    int            `json:"maxMembers"`
	MaxMediaSeats int            `json:"maxMediaSeats"`
}

type User struct {
	ID           xid.ID `json:"id"`
	Name         string `json:"name"`
	Streaming    bool   `json:"streaming"`
	VoiceActive  bool   `json:"voiceActive"`
	You          bool   `json:"you"`
	Owner        bool   `json:"owner"`
	MediaEnabled bool   `json:"mediaEnabled"`
	MediaActive  bool   `json:"mediaActive"`
}

// RoomMessage carries lightweight, non-persistent collaboration signals. File
// payloads never use this message; only invitations and transfer controls do.
type RoomMessage struct {
	Kind string          `json:"kind"`
	From xid.ID          `json:"from"`
	To   []xid.ID        `json:"to,omitempty"`
	Data json.RawMessage `json:"data"`
	At   int64           `json:"at"`
}

func (RoomMessage) Type() string { return "roommessage" }

func (Room) Type() string {
	return "room"
}

type HostSession struct {
	ID         xid.ID      `json:"id"`
	Peer       xid.ID      `json:"peer"`
	Kind       string      `json:"kind"`
	ICEServers []ICEServer `json:"iceServers"`
}

func (HostSession) Type() string {
	return "hostsession"
}

type ClientSession struct {
	ID         xid.ID      `json:"id"`
	Peer       xid.ID      `json:"peer"`
	Kind       string      `json:"kind"`
	ICEServers []ICEServer `json:"iceServers"`
}

func (ClientSession) Type() string {
	return "clientsession"
}

type ICEServer struct {
	URLs       []string `json:"urls"`
	Credential string   `json:"credential"`
	Username   string   `json:"username"`
}

type P2PMessage struct {
	SID   xid.ID          `json:"sid"`
	Value json.RawMessage `json:"value"`
}

type HostICE P2PMessage

func (HostICE) Type() string {
	return "hostice"
}

type ClientICE P2PMessage

func (ClientICE) Type() string {
	return "clientice"
}

type ClientAnswer P2PMessage

func (ClientAnswer) Type() string {
	return "clientanswer"
}

type HostOffer P2PMessage

func (HostOffer) Type() string {
	return "hostoffer"
}

type EndShare xid.ID

func (EndShare) Type() string {
	return "endshare"
}

type ConnectionMode string

const (
	ConnectionLocal ConnectionMode = "local"
	ConnectionSTUN  ConnectionMode = "stun"
	ConnectionTURN  ConnectionMode = "turn"
)

type CloseWriter struct {
	Code   int
	Reason string
}

func (CloseWriter) Type() string {
	return "closewriter"
}
