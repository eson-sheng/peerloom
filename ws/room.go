package ws

import (
	"fmt"
	"net"
	"sort"
	"time"

	"github.com/peerloom/server/config"
	"github.com/peerloom/server/ws/outgoing"
	"github.com/rs/xid"
	"github.com/rs/zerolog/log"
)

type ConnectionMode string

const (
	ConnectionLocal ConnectionMode = "local"
	ConnectionSTUN  ConnectionMode = "stun"
	ConnectionTURN  ConnectionMode = config.AuthModeTurn
)

type Room struct {
	Playback          *outgoing.PlaybackState
	ID                string
	CloseOnOwnerLeave bool
	Mode              ConnectionMode
	Users             map[xid.ID]*User
	Sessions          map[xid.ID]*RoomSession
	MemberLimit       int
	MediaSeatLimit    int
	Locked            bool
}

// Default limits keep the WebRTC mesh small; room configuration may override them.
const MaxRoomMembers = 12
const MaxMediaSeats = 6

func (r *Room) maxMembers() int {
	if r.MemberLimit > 0 {
		return r.MemberLimit
	}
	return MaxRoomMembers
}
func (r *Room) maxMediaSeats() int {
	if r.MediaSeatLimit > 0 {
		return r.MediaSeatLimit
	}
	return MaxMediaSeats
}

const (
	CloseOwnerLeft = "房主已离开，房间已关闭"
	CloseDone      = "读取结束"
)

func (r *Room) newSession(host, client xid.ID, rooms *Rooms, v4, v6 net.IP, kind string) {
	id := xid.New()
	r.Sessions[id] = &RoomSession{
		Host:   host,
		Client: client,
		Kind:   kind,
	}
	sessionCreatedTotal.Inc()

	iceHost := []outgoing.ICEServer{}
	iceClient := []outgoing.ICEServer{}
	switch r.Mode {
	case ConnectionLocal:
	case ConnectionSTUN:
		iceHost = []outgoing.ICEServer{{URLs: rooms.addresses("stun", v4, v6, false)}}
		iceClient = []outgoing.ICEServer{{URLs: rooms.addresses("stun", v4, v6, false)}}
	case ConnectionTURN:
		hostName, hostPW := rooms.turnServer.Credentials(id.String()+"host", r.Users[host].Addr)
		clientName, clientPW := rooms.turnServer.Credentials(id.String()+"client", r.Users[client].Addr)
		iceHost = []outgoing.ICEServer{{
			URLs:       rooms.addresses("turn", v4, v6, true),
			Credential: hostPW,
			Username:   hostName,
		}}
		iceClient = []outgoing.ICEServer{{
			URLs:       rooms.addresses("turn", v4, v6, true),
			Credential: clientPW,
			Username:   clientName,
		}}
	}
	r.Users[host].WriteTimeout(outgoing.HostSession{Peer: client, ID: id, Kind: kind, ICEServers: iceHost})
	r.Users[client].WriteTimeout(outgoing.ClientSession{Peer: host, ID: id, Kind: kind, ICEServers: iceClient})
}

func (r *Rooms) addresses(prefix string, v4, v6 net.IP, tcp bool) (result []string) {
	if v4 != nil {
		result = append(result, fmt.Sprintf("%s:%s:%s", prefix, v4.String(), r.config.TurnPort))
		if tcp {
			result = append(result, fmt.Sprintf("%s:%s:%s?transport=tcp", prefix, v4.String(), r.config.TurnPort))
		}
	}
	if v6 != nil {
		result = append(result, fmt.Sprintf("%s:[%s]:%s", prefix, v6.String(), r.config.TurnPort))
		if tcp {
			result = append(result, fmt.Sprintf("%s:[%s]:%s?transport=tcp", prefix, v6.String(), r.config.TurnPort))
		}
	}
	return
}

func (r *Room) closeSession(rooms *Rooms, id xid.ID) {
	if r.Mode == ConnectionTURN {
		rooms.turnServer.Disallow(id.String() + "host")
		rooms.turnServer.Disallow(id.String() + "client")
	}
	delete(r.Sessions, id)
	sessionClosedTotal.Inc()
}

type RoomSession struct {
	Host   xid.ID
	Client xid.ID
	Kind   string
}

func (r *Room) notifyInfoChanged() {
	for _, current := range r.Users {
		users := []outgoing.User{}
		for _, user := range r.Users {
			users = append(users, outgoing.User{
				ID:           user.ID,
				Name:         user.Name,
				Streaming:    user.Streaming,
				VoiceActive:  user.VoiceActive,
				You:          current == user,
				Owner:        user.Owner,
				MediaEnabled: user.MediaEnabled,
				MediaActive:  user.MediaActive,
			})
		}

		sort.Slice(users, func(i, j int) bool {
			left := users[i]
			right := users[j]

			if left.Owner != right.Owner {
				return left.Owner
			}

			if left.Streaming != right.Streaming {
				return left.Streaming
			}

			return left.Name < right.Name
		})

		current.WriteTimeout(outgoing.Room{
			ID:            r.ID,
			Playback:      r.Playback,
			Locked:        r.Locked,
			MaxMembers:    r.maxMembers(),
			MaxMediaSeats: r.maxMediaSeats(),
			Users:         users,
		})
	}
}

type User struct {
	ID           xid.ID
	Addr         net.IP
	Name         string
	Streaming    bool
	VoiceActive  bool
	Owner        bool
	MediaEnabled bool
	MediaActive  bool
	_write       chan<- outgoing.Message
}

func (u *User) WriteTimeout(msg outgoing.Message) {
	writeTimeout(u._write, msg)
}

func writeTimeout[T any](ch chan<- T, msg T) {
	select {
	case <-time.After(2 * time.Second):
		log.Warn().Interface("event", fmt.Sprintf("%T", msg)).Interface("payload", msg).Msg("Client write loop didn't accept the message.")
	case ch <- msg:
	}
}
