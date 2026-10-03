package ws

import (
	"fmt"

	"github.com/peerloom/server/ws/outgoing"
	"github.com/rs/xid"
)

func init() { register("stopshare", func() Event { return &StopShare{} }) }

type StopShare struct {
	Kind string `json:"kind,omitempty"`
}

// stopMedia releases only the user's outgoing media, preserving file channels.
func (room *Room) stopMedia(rooms *Rooms, userID xid.ID) {
	room.stopMediaKind(rooms, userID, "media")
	room.stopMediaKind(rooms, userID, "voice")
}

func (room *Room) stopMediaKind(rooms *Rooms, userID xid.ID, kind string) {
	if kind == "voice" {
		room.Users[userID].VoiceActive = false
	} else {
		if room.Playback != nil && room.Playback.From == userID {
			room.Playback = nil
		}
		room.Users[userID].Streaming = false
	}
	for id, session := range room.Sessions {
		if session.Host != userID || session.Kind != kind {
			continue
		}
		for _, peerID := range []xid.ID{session.Host, session.Client} {
			if peer, ok := room.Users[peerID]; ok {
				peer.WriteTimeout(outgoing.EndShare(id))
			}
		}
		room.closeSession(rooms, id)
	}
}

func (e *StopShare) Execute(rooms *Rooms, current ClientInfo) error {
	room, err := rooms.CurrentRoom(current)
	if err != nil {
		return err
	}
	kind := e.Kind
	if kind == "" {
		kind = "media"
	}
	if kind != "media" && kind != "voice" {
		return fmt.Errorf("不支持的媒体类型")
	}
	room.stopMediaKind(rooms, current.ID, kind)
	room.notifyInfoChanged()
	return nil
}
