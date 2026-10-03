package ws

import (
	"fmt"
)

func init() {
	register("join", func() Event {
		return &Join{}
	})
}

type Join struct {
	ID       string `json:"id"`
	UserName string `json:"username,omitempty"`
}

func (e *Join) Execute(rooms *Rooms, current ClientInfo) error {
	if rooms.connected[current.ID] != "" {
		return fmt.Errorf("你已在其他房间中，无法重复加入")
	}

	room, ok := rooms.Rooms[e.ID]
	if !ok {
		return fmt.Errorf("房间 %s 不存在", e.ID)
	}
	if room.Locked {
		return fmt.Errorf("房间已锁定")
	}
	if len(room.Users) >= room.maxMembers() {
		return fmt.Errorf("房间人数已满")
	}
	name := e.UserName
	if current.Authenticated {
		name = current.AuthenticatedUser
	}
	if name == "" {
		name = rooms.RandUserName()
	}

	mediaActive := 0
	for _, member := range room.Users {
		if member.MediaActive {
			mediaActive++
		}
	}

	room.Users[current.ID] = &User{
		ID:           current.ID,
		Name:         name,
		Streaming:    false,
		Owner:        false,
		MediaEnabled: true,
		MediaActive:  mediaActive < room.maxMediaSeats(),
		Addr:         current.Addr,
		_write:       current.Write,
	}
	rooms.connected[current.ID] = room.ID
	room.notifyInfoChanged()
	usersJoinedTotal.Inc()

	v4, v6, err := rooms.config.TurnIPProvider.Get()
	if err != nil {
		return err
	}

	for _, user := range room.Users {
		if current.ID == user.ID {
			continue
		}
		room.newSession(user.ID, current.ID, rooms, v4, v6, "data")
		if user.VoiceActive {
			room.newSession(user.ID, current.ID, rooms, v4, v6, "voice")
		}
		if user.Streaming {
			room.newSession(user.ID, current.ID, rooms, v4, v6, "media")
		}
	}

	return nil
}
