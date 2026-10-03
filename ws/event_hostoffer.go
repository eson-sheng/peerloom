package ws

import (
	"fmt"

	"github.com/peerloom/server/ws/outgoing"
	"github.com/rs/zerolog/log"
)

func init() {
	register("hostoffer", func() Event {
		return &HostOffer{}
	})
}

type HostOffer outgoing.P2PMessage

func (e *HostOffer) Execute(rooms *Rooms, current ClientInfo) error {
	room, err := rooms.CurrentRoom(current)
	if err != nil {
		return err
	}

	session, ok := room.Sessions[e.SID]

	if !ok {
		log.Debug().Str("id", e.SID.String()).Msg("unknown session")
		return nil
	}

	if session.Host != current.ID {
		return fmt.Errorf("无权操作该连接会话")
	}

	room.Users[session.Client].WriteTimeout(outgoing.HostOffer(*e))

	return nil
}
