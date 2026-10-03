package ws

import (
	"fmt"
	"github.com/peerloom/server/ws/outgoing"

	"github.com/rs/xid"
)

func init() {
	register("datareconnect", func() Event { return &DataReconnect{} })
}

// DataReconnect creates a replacement data-only session after a WebRTC data
// channel drops. It never creates a media session and only permits a member to
// reconnect to another current member of the same room.
type DataReconnect struct {
	Target xid.ID `json:"target"`
	SID    xid.ID `json:"sid"`
}

func (e *DataReconnect) Execute(rooms *Rooms, current ClientInfo) error {
	room, err := rooms.CurrentRoom(current)
	if err != nil {
		return err
	}
	if e.Target == current.ID {
		return fmt.Errorf("不能与自己重新建立数据连接")
	}
	if _, ok := room.Users[e.Target]; !ok {
		return nil // The peer may leave before its data channel closes locally.
	}
	if e.SID == (xid.ID{}) {
		return nil
	}
	session, ok := room.Sessions[e.SID]
	if !ok {
		return nil
	}
	if session.Kind != "data" || !((session.Host == current.ID && session.Client == e.Target) || (session.Client == current.ID && session.Host == e.Target)) {
		return fmt.Errorf("无权重建该数据连接")
	}
	v4, v6, err := rooms.config.TurnIPProvider.Get()
	if err != nil {
		return err
	}
	room.Users[session.Host].WriteTimeout(outgoing.EndShare(e.SID))
	room.Users[session.Client].WriteTimeout(outgoing.EndShare(e.SID))
	room.closeSession(rooms, e.SID)
	room.newSession(current.ID, e.Target, rooms, v4, v6, "data")
	return nil
}
