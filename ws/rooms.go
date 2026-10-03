package ws

import (
	"fmt"
	"math/rand"
	"net/http"
	"net/url"
	"time"

	"github.com/gorilla/websocket"
	"github.com/peerloom/server/auth"
	"github.com/peerloom/server/config"
	"github.com/peerloom/server/turn"
	"github.com/peerloom/server/util"
	"github.com/peerloom/server/ws/outgoing"
	"github.com/rs/xid"
	"github.com/rs/zerolog/log"
)

func NewRooms(tServer turn.Server, users *auth.Users, conf config.Config) *Rooms {
	return &Rooms{
		Rooms:      map[string]*Room{},
		Incoming:   make(chan ClientMessage),
		connected:  map[xid.ID]string{},
		turnServer: tServer,
		users:      users,
		config:     conf,
		r:          rand.New(rand.NewSource(time.Now().Unix())),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("origin")
				u, err := url.Parse(origin)
				if err != nil {
					return false
				}
				if u.Host == r.Host {
					return true
				}
				return conf.CheckOrigin(origin)
			},
		},
	}
}

type Rooms struct {
	turnServer turn.Server
	Rooms      map[string]*Room
	Incoming   chan ClientMessage
	upgrader   websocket.Upgrader
	users      *auth.Users
	config     config.Config
	r          *rand.Rand
	connected  map[xid.ID]string
}

func (r *Rooms) CurrentRoom(info ClientInfo) (*Room, error) {
	roomID, ok := r.connected[info.ID]
	if !ok {
		return nil, fmt.Errorf("连接尚未建立")
	}
	if roomID == "" {
		return nil, fmt.Errorf("尚未进入房间")
	}
	room, ok := r.Rooms[roomID]
	if !ok {
		return nil, fmt.Errorf("房间 %s 不存在", roomID)
	}

	return room, nil
}

func (r *Rooms) RandUserName() string {
	return util.NewUserName(r.r)
}

func (r *Rooms) RandRoomName() string {
	return util.NewRoomName(r.r)
}

func (r *Rooms) Upgrade(w http.ResponseWriter, req *http.Request) {
	user, loggedIn := r.users.CurrentUser(req)
	conn, err := r.upgrader.Upgrade(w, req, nil)
	if err != nil {
		log.Debug().Err(err).Msg("Websocket upgrade")
		w.WriteHeader(400)
		_, _ = fmt.Fprintf(w, "Upgrade failed %s", err)
		return
	}

	c := newClient(conn, req, r.Incoming, user, loggedIn, r.config.TrustProxyHeaders)
	r.Incoming <- ClientMessage{Info: c.info, Incoming: Connected{}, SkipConnectedCheck: true}

	go c.startReading(time.Second * 20)
	go c.startWriteHandler(time.Second * 5)
}

func (r *Rooms) Start() {
	for msg := range r.Incoming {
		_, connected := r.connected[msg.Info.ID]
		if !msg.SkipConnectedCheck && !connected {
			log.Debug().Interface("event", fmt.Sprintf("%T", msg.Incoming)).Interface("payload", msg.Incoming).Msg("WebSocket Ignore")
			continue
		}

		if err := msg.Incoming.Execute(r, msg.Info); err != nil {
			// A rejected room operation must not disconnect a healthy member.
			if room, roomErr := r.CurrentRoom(msg.Info); roomErr == nil && room.Users[msg.Info.ID] != nil {
				operation := ""
				if share, ok := msg.Incoming.(*StartShare); ok {
					operation = "share"
					if share.Kind == "voice" {
						operation = "voice"
					}
				}
				writeTimeout[outgoing.Message](msg.Info.Write, outgoing.OperationError{Message: err.Error(), Operation: operation})
				continue
			}
			dis := Disconnected{Code: websocket.CloseNormalClosure, Reason: err.Error()}
			dis.executeNoError(r, msg.Info)
		}
	}
}

func (r *Rooms) Count() (int, string) {
	timeout := time.After(5 * time.Second)

	h := Health{Response: make(chan int, 1)}
	select {
	case r.Incoming <- ClientMessage{SkipConnectedCheck: true, Incoming: &h}:
	case <-timeout:
		return -1, "main loop didn't accept a message within 5 second"
	}
	select {
	case count := <-h.Response:
		return count, ""
	case <-timeout:
		return -1, "main loop didn't respond to a message within 5 second"
	}
}

func (r *Rooms) closeRoom(roomID string) {
	room, ok := r.Rooms[roomID]
	if !ok {
		return
	}
	usersLeftTotal.Add(float64(len(room.Users)))
	for id := range room.Sessions {
		room.closeSession(r, id)
	}

	delete(r.Rooms, roomID)
	roomsClosedTotal.Inc()
}
