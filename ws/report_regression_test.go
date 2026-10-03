package ws

import (
	"encoding/json"
	"github.com/peerloom/server/ws/outgoing"
	"github.com/rs/xid"
	"testing"
)

func TestDataReconnectReplacesSessionOnce(t *testing.T) {
	r, a, b := auditRoom()
	room := r.Rooms["audit"]
	old := xid.New()
	media := xid.New()
	room.Sessions[old] = &RoomSession{Host: a.ID, Client: b.ID, Kind: "data"}
	room.Sessions[media] = &RoomSession{Host: a.ID, Client: b.ID, Kind: "media"}
	for _, event := range []*DataReconnect{{Target: b.ID, SID: old}, {Target: a.ID, SID: old}, {Target: b.ID, SID: old}} {
		sender := a
		if event.Target == a.ID {
			sender = b
		}
		if err := event.Execute(r, sender); err != nil {
			t.Fatal(err)
		}
	}
	if len(room.Sessions) != 2 || room.Sessions[old] != nil || room.Sessions[media] == nil {
		t.Fatal("replacement multiplied sessions or removed media")
	}
}

func TestPlaybackSnapshotForLateJoinAndCleanup(t *testing.T) {
	r, a, b := auditRoom()
	room := r.Rooms["audit"]
	if err := (&StartShare{Playback: true}).Execute(r, a); err != nil {
		t.Fatal(err)
	}
	if err := (&RoomMessage{Kind: "playback", Data: json.RawMessage(`{"action":"sync","currentTime":42,"duration":100,"rate":1.5,"paused":true}`)}).Execute(r, a); err != nil {
		t.Fatal(err)
	}
	guest := ClientInfo{ID: xid.New(), Write: make(chan outgoing.Message, 100)}
	if err := (&Join{ID: room.ID}).Execute(r, guest); err != nil {
		t.Fatal(err)
	}
	message := <-guest.Write
	joined, ok := message.(outgoing.Room)
	if !ok || joined.Playback == nil || joined.Playback.CurrentTime != 42 || !joined.Playback.Paused || joined.Playback.From != a.ID {
		t.Fatalf("late join missing playback snapshot: %#v", message)
	}
	if err := (&RoomMessage{Kind: "playback", Data: json.RawMessage(`{"action":"sync","currentTime":70}`)}).Execute(r, b); err == nil {
		t.Fatal("spectator controlled playback")
	}
	if err := (&StopShare{}).Execute(r, a); err != nil {
		t.Fatal(err)
	}
	if room.Playback != nil {
		t.Fatal("stopped playback snapshot remains")
	}
}

func TestRoomSurvivesWithSuccessorWhenOwnerLeaves(t *testing.T) {
	r, a, b := auditRoom()
	room := r.Rooms["audit"]
	room.CloseOnOwnerLeave = false
	room.Playback = &outgoing.PlaybackState{From: a.ID}
	auditDispatch(r, a, &Disconnected{})
	if r.Rooms["audit"] == nil || !room.Users[b.ID].Owner || room.Playback != nil {
		t.Fatal("room lost ownership or retained departed playback")
	}
}
