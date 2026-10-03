package ws

import (
	"fmt"

	"github.com/peerloom/server/ws/outgoing"
	"github.com/rs/zerolog/log"
)

func init() {
	register("clientice", func() Event {
		return &ClientICE{}
	})
}

type ClientICE outgoing.P2PMessage

func (e *ClientICE) Execute(rooms *Rooms, current ClientInfo) error {
	room, err := rooms.CurrentRoom(current)
	if err != nil {
		return err
	}

	session, ok := room.Sessions[e.SID]

	if !ok {
		log.Debug().Str("id", e.SID.String()).Msg("unknown session")
		return nil
	}

	if session.Client != current.ID {
		return fmt.Errorf("无权操作该连接会话")
	}

	room.Users[session.Host].WriteTimeout(outgoing.ClientICE(*e))

	return nil
}
