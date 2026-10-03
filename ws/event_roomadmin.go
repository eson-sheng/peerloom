package ws

import (
	"bytes"
	"fmt"

	"github.com/gorilla/websocket"
	"github.com/peerloom/server/ws/outgoing"
	"github.com/rs/xid"
)

func init() {
	register("roomadmin", func() Event { return &RoomAdmin{} })
	register("mediaseat", func() Event { return &MediaSeat{} })
}

type RoomAdmin struct {
	Action       string `json:"action"`
	Target       xid.ID `json:"target,omitempty"`
	Locked       bool   `json:"locked,omitempty"`
	MediaEnabled bool   `json:"mediaEnabled,omitempty"`
}

func (e *RoomAdmin) Execute(rooms *Rooms, current ClientInfo) error {
	room, err := rooms.CurrentRoom(current)
	if err != nil {
		return err
	}
	if !room.Users[current.ID].Owner {
		return fmt.Errorf("仅房主可管理成员")
	}

	switch e.Action {
	case "lock":
		room.Locked = e.Locked
		room.notifyInfoChanged()
		return nil
	case "media":
		target, ok := room.Users[e.Target]
		if !ok {
			return fmt.Errorf("未找到该成员")
		}
		target.MediaEnabled = e.MediaEnabled
		if !e.MediaEnabled {
			target.MediaActive = false
			room.stopMedia(rooms, target.ID)
		}
		room.notifyInfoChanged()
		return nil
	case "kick":
		target, ok := room.Users[e.Target]
		if !ok {
			return fmt.Errorf("未找到该成员")
		}
		if target.Owner {
			return fmt.Errorf("不能移除房主")
		}
		target.WriteTimeout(outgoing.CloseWriter{Code: websocket.ClosePolicyViolation, Reason: "你已被房主移出房间"})
		delete(rooms.connected, target.ID)
		if room.Playback != nil && room.Playback.From == target.ID {
			room.Playback = nil
		}
		delete(room.Users, target.ID)
		for id, session := range room.Sessions {
			if !bytes.Equal(session.Host.Bytes(), target.ID.Bytes()) && !bytes.Equal(session.Client.Bytes(), target.ID.Bytes()) {
				continue
			}
			if peer, ok := room.Users[session.Host]; ok {
				peer.WriteTimeout(outgoing.EndShare(id))
			}
			if peer, ok := room.Users[session.Client]; ok {
				peer.WriteTimeout(outgoing.EndShare(id))
			}
			room.closeSession(rooms, id)
		}
		room.notifyInfoChanged()
		return nil
	default:
		return fmt.Errorf("不支持的房间管理操作")
	}
}

type MediaSeat struct {
	Active bool `json:"active"`
}

func (e *MediaSeat) Execute(rooms *Rooms, current ClientInfo) error {
	room, err := rooms.CurrentRoom(current)
	if err != nil {
		return err
	}
	user := room.Users[current.ID]
	if e.Active && !user.MediaEnabled {
		return fmt.Errorf("房主已关闭你的媒体权限")
	}
	if e.Active && !user.MediaActive {
		used := 0
		for _, member := range room.Users {
			if member.MediaActive {
				used++
			}
		}
		if used >= room.maxMediaSeats() {
			return fmt.Errorf("实时媒体席位已满（最多 %d 人）", room.maxMediaSeats())
		}
	}
	user.MediaActive = e.Active
	if !e.Active {
		room.stopMediaKind(rooms, current.ID, "media")
	}
	room.notifyInfoChanged()
	return nil
}
