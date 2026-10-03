package ws

import (
	"errors"
	"fmt"

	"github.com/peerloom/server/config"
	"github.com/rs/xid"
)

func init() {
	register("create", func() Event {
		return &Create{}
	})
}

type Create struct {
	ID                string         `json:"id"`
	Mode              ConnectionMode `json:"mode"`
	CloseOnOwnerLeave bool           `json:"closeOnOwnerLeave"`
	UserName          string         `json:"username"`
	JoinIfExist       bool           `json:"joinIfExist,omitempty"`
}

func (e *Create) Execute(rooms *Rooms, current ClientInfo) error {
	if rooms.connected[current.ID] != "" {
		return fmt.Errorf("你已在其他房间中，无法重复加入")
	}

	if _, ok := rooms.Rooms[e.ID]; ok {
		if e.JoinIfExist {
			join := &Join{UserName: e.UserName, ID: e.ID}
			return join.Execute(rooms, current)
		}

		return fmt.Errorf("房间 %s 已存在", e.ID)
	}

	if rooms.config.UsersFile != "" && !current.Authenticated {
		return errors.New("创建房间前请先登录")
	}

	name := e.UserName
	if current.Authenticated {
		name = current.AuthenticatedUser
	}
	if name == "" {
		name = rooms.RandUserName()
	}

	switch rooms.config.AuthMode {
	case config.AuthModeNone:
	case config.AuthModeAll:
		if !current.Authenticated {
			return errors.New("请先登录")
		}
	case config.AuthModeTurn:
		if e.Mode != ConnectionSTUN && e.Mode != ConnectionLocal && !current.Authenticated {
			return errors.New("请先登录")
		}
	default:
		return errors.New("服务认证模式配置无效")
	}

	room := &Room{
		MemberLimit:       rooms.config.MaxRoomMembers,
		MediaSeatLimit:    rooms.config.MaxMediaSeats,
		ID:                e.ID,
		CloseOnOwnerLeave: e.CloseOnOwnerLeave,
		Mode:              e.Mode,
		Sessions:          map[xid.ID]*RoomSession{},
		Users: map[xid.ID]*User{
			current.ID: {
				ID:           current.ID,
				Name:         name,
				Streaming:    false,
				Owner:        true,
				MediaEnabled: true,
				MediaActive:  true,
				Addr:         current.Addr,
				_write:       current.Write,
			},
		},
	}
	rooms.connected[current.ID] = room.ID
	rooms.Rooms[e.ID] = room
	room.notifyInfoChanged()
	usersJoinedTotal.Inc()
	roomsCreatedTotal.Inc()
	return nil
}
