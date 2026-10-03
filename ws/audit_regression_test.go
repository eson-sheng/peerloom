package ws

import (
	"encoding/json"
	"testing"

	"github.com/peerloom/server/config"
	"github.com/peerloom/server/config/ipdns"
	"github.com/peerloom/server/ws/outgoing"
	"github.com/rs/xid"
)

func auditRoom() (*Rooms, ClientInfo, ClientInfo) {
	r := NewRooms(nil, nil, config.Config{TurnIPProvider: &ipdns.Static{}})
	a := ClientInfo{ID: xid.New(), Write: make(chan outgoing.Message, 100)}
	b := ClientInfo{ID: xid.New(), Write: make(chan outgoing.Message, 100)}
	room := &Room{ID: "audit", CloseOnOwnerLeave: true, Mode: ConnectionLocal, Users: map[xid.ID]*User{}, Sessions: map[xid.ID]*RoomSession{}}
	for _, c := range []ClientInfo{a, b} {
		room.Users[c.ID] = &User{ID: c.ID, Owner: c.ID == a.ID, MediaEnabled: true, MediaActive: true, _write: c.Write}
		r.connected[c.ID] = room.ID
	}
	r.Rooms[room.ID] = room
	return r, a, b
}
func auditDispatch(r *Rooms, c ClientInfo, e Event) {
	r.Incoming = make(chan ClientMessage, 1)
	r.Incoming <- ClientMessage{Info: c, Incoming: e}
	close(r.Incoming)
	r.Start()
}
func TestAuditGuestLeavePreservesOwner(t *testing.T) {
	r, a, b := auditRoom()
	auditDispatch(r, b, &Disconnected{})
	if r.Rooms["audit"] == nil || r.connected[a.ID] != "audit" {
		t.Fatal("guest leave removed owner")
	}
}
func TestAuditShareConflictPreservesRoom(t *testing.T) {
	r, a, b := auditRoom()
	r.Rooms["audit"].Users[b.ID].Streaming = true
	auditDispatch(r, a, &StartShare{})
	if r.Rooms["audit"] == nil {
		t.Fatal("share conflict closed entire room")
	}
}
func TestAuditDepartedRecipientPreservesOwner(t *testing.T) {
	r, a, b := auditRoom()
	auditDispatch(r, b, &Disconnected{})
	auditDispatch(r, a, &RoomMessage{Kind: "file-response", To: []xid.ID{b.ID}, Data: json.RawMessage(`{"accepted":true}`)})
	if r.Rooms["audit"] == nil {
		t.Fatal("message to departed recipient closed entire room")
	}
}
func TestAuditRevokeMediaStopsStreaming(t *testing.T) {
	r, a, b := auditRoom()
	room := r.Rooms["audit"]
	room.Users[b.ID].Streaming = true
	sid := xid.New()
	room.Sessions[sid] = &RoomSession{Host: b.ID, Client: a.ID, Kind: "media"}
	auditDispatch(r, a, &RoomAdmin{Action: "media", Target: b.ID, MediaEnabled: false})
	if room.Users[b.ID].Streaming || room.Sessions[sid] != nil {
		t.Fatal("revoked user retains streaming flag and/or media session")
	}
}
func TestAuditLeaveSeatStopsStreaming(t *testing.T) {
	r, _, b := auditRoom()
	room := r.Rooms["audit"]
	room.Users[b.ID].Streaming = true
	auditDispatch(r, b, &MediaSeat{Active: false})
	if room.Users[b.ID].Streaming {
		t.Fatal("user without media seat still streaming")
	}
}
func TestAuditReconnectDepartedPeerPreservesOwner(t *testing.T) {
	r, a, b := auditRoom()
	auditDispatch(r, b, &Disconnected{})
	auditDispatch(r, a, &DataReconnect{Target: b.ID})
	if r.Rooms["audit"] == nil {
		t.Fatal("automatic reconnect to departed peer closed entire room")
	}
}

func TestAuditMediaCleanupPreservesDataAndNotifiesBothPeers(t *testing.T) {
	for _, action := range []string{"revoke", "leave", "stop"} {
		t.Run(action, func(t *testing.T) {
			r, a, b := auditRoom()
			room := r.Rooms["audit"]
			room.Users[b.ID].Streaming = true
			mediaID, dataID := xid.New(), xid.New()
			room.Sessions[mediaID] = &RoomSession{Host: b.ID, Client: a.ID, Kind: "media"}
			room.Sessions[dataID] = &RoomSession{Host: b.ID, Client: a.ID, Kind: "data"}
			switch action {
			case "revoke":
				auditDispatch(r, a, &RoomAdmin{Action: "media", Target: b.ID, MediaEnabled: false})
			case "leave":
				auditDispatch(r, b, &MediaSeat{Active: false})
			case "stop":
				auditDispatch(r, b, &StopShare{})
			}
			if room.Users[b.ID].Streaming || room.Sessions[mediaID] != nil || room.Sessions[dataID] == nil {
				t.Fatal("media cleanup must preserve data session only")
			}
			for _, c := range []ClientInfo{a, b} {
				found := false
				for len(c.Write) > 0 {
					msg := <-c.Write
					if end, ok := msg.(outgoing.EndShare); ok && xid.ID(end) == mediaID {
						found = true
					}
					if _, ok := msg.(outgoing.CloseWriter); ok {
						t.Fatal("media cleanup disconnected member")
					}
				}
				if !found {
					t.Fatal("missing media end notification")
				}
			}
			auditDispatch(r, b, &StopShare{}) // repeated cleanup must remain harmless
			if room.Sessions[dataID] == nil {
				t.Fatal("repeated stop removed data")
			}
		})
	}
}

func TestAuditConflictReportsErrorAndRoomRemainsUsable(t *testing.T) {
	r, a, b := auditRoom()
	room := r.Rooms["audit"]
	room.Users[b.ID].Streaming = true
	room.Playback = &outgoing.PlaybackState{From: b.ID}
	auditDispatch(r, a, &StartShare{Playback: true})
	select {
	case msg := <-a.Write:
		err, ok := msg.(outgoing.OperationError)
		if !ok || err.Operation != "share" || err.Message == "" {
			t.Fatalf("expected actionable share error, got %#v", msg)
		}
	default:
		t.Fatal("missing error notification")
	}
	if r.connected[a.ID] != "audit" || !room.Users[b.ID].Streaming {
		t.Fatal("conflict changed room membership or active streamer")
	}
	auditDispatch(r, b, &StopShare{})
	auditDispatch(r, a, &StartShare{})
	if !room.Users[a.ID].Streaming {
		t.Fatal("owner could not share after conflict resolved")
	}
}

func TestAuditOwnerLeaveStillClosesRoom(t *testing.T) {
	r, a, b := auditRoom()
	auditDispatch(r, a, &Disconnected{})
	if r.Rooms["audit"] != nil || r.connected[b.ID] != "" {
		t.Fatal("explicit owner leave must still enforce room policy")
	}
}
