package ws

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/peerloom/server/auth"
	"github.com/peerloom/server/config"
	"github.com/peerloom/server/config/ipdns"
	"github.com/peerloom/server/ws/outgoing"
	"github.com/rs/xid"
	"golang.org/x/crypto/bcrypt"
)

func TestUsersFileAllowsGuestConnections(t *testing.T) {
	users, err := auth.ReadPasswordsFile("", []byte("test-secret"), 0)
	if err != nil {
		t.Fatal(err)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte("password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	users.Lookup["alice"] = string(hash)
	login := httptest.NewRequest(http.MethodPost, "/login", strings.NewReader(url.Values{"user": {"alice"}, "pass": {"password"}}.Encode()))
	login.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response := httptest.NewRecorder()
	users.Authenticate(response, login)
	if response.Code != http.StatusOK {
		t.Fatalf("login: %d", response.Code)
	}
	for _, mode := range []string{config.AuthModeNone, config.AuthModeTurn, config.AuthModeAll} {
		for _, file := range []string{"", "./users"} {
			for _, loggedIn := range []bool{false, true} {
				rooms := NewRooms(nil, users, config.Config{UsersFile: file, AuthMode: mode})
				req := httptest.NewRequest(http.MethodGet, "/stream", nil)
				if loggedIn {
					for _, cookie := range response.Result().Cookies() {
						req.AddCookie(cookie)
					}
				}
				out := httptest.NewRecorder()
				rooms.Upgrade(out, req)
				// An authenticated/guest-enabled request reaches WebSocket validation.
				want := http.StatusBadRequest
				if out.Code != want {
					t.Errorf("mode=%s file=%q loggedIn=%t: got %d, want %d", mode, file, loggedIn, out.Code, want)
				}
			}
		}
	}
}

func TestUsersFileRequiresLoginOnlyForCreation(t *testing.T) {
	for _, mode := range []string{config.AuthModeNone, config.AuthModeTurn, config.AuthModeAll} {
		t.Run(mode, func(t *testing.T) {
			rooms := NewRooms(nil, nil, config.Config{UsersFile: "./users", AuthMode: mode, TurnIPProvider: &ipdns.Static{}})
			guest := ClientInfo{ID: xid.New(), Write: make(chan outgoing.Message, 10)}
			create := Create{ID: "new-room", Mode: ConnectionSTUN}
			if err := create.Execute(rooms, guest); err == nil {
				t.Fatal("guest created a room")
			}
			if len(rooms.Rooms) != 0 || len(rooms.connected) != 0 {
				t.Fatal("rejected creation changed room state")
			}
			owner := ClientInfo{ID: xid.New(), Authenticated: true, AuthenticatedUser: "alice", Write: make(chan outgoing.Message, 10)}
			if err := create.Execute(rooms, owner); err != nil {
				t.Fatalf("logged-in creation: %v", err)
			}
			// Empty existing rooms avoid involving peer negotiation in this access-control test.
			for _, viaCreate := range []bool{false, true} {
				id := xid.New().String()
				rooms.Rooms[id] = &Room{ID: id, Users: map[xid.ID]*User{}, Sessions: map[xid.ID]*RoomSession{}}
				visitor := ClientInfo{ID: xid.New(), Write: make(chan outgoing.Message, 10)}
				var err error
				if viaCreate {
					err = (&Create{ID: id, JoinIfExist: true}).Execute(rooms, visitor)
				} else {
					err = (&Join{ID: id}).Execute(rooms, visitor)
				}
				if err != nil {
					t.Fatalf("guest join (viaCreate=%t): %v", viaCreate, err)
				}
				if rooms.connected[visitor.ID] != id {
					t.Fatal("guest was not joined")
				}
			}
		})
	}
}

func TestNoUsersFilePreservesGuestCreation(t *testing.T) {
	rooms := NewRooms(nil, nil, config.Config{AuthMode: config.AuthModeNone})
	guest := ClientInfo{ID: xid.New(), Write: make(chan outgoing.Message, 10)}
	if err := (&Create{ID: "guest-room", Mode: ConnectionSTUN}).Execute(rooms, guest); err != nil {
		t.Fatal(err)
	}
}
