package ws

import (
	"encoding/json"
	"github.com/peerloom/server/ws/outgoing"
	"github.com/rs/xid"
	"testing"
)

func TestTwelveVoicesSixPresentersAndSinglePlayback(t *testing.T) {
	r, a, b := auditRoom()
	room := r.Rooms["audit"]
	members := []ClientInfo{a, b}
	for len(members) < 12 {
		c := ClientInfo{ID: xid.New(), Write: make(chan outgoing.Message, 1000)}
		if err := (&Join{ID: room.ID}).Execute(r, c); err != nil {
			t.Fatal(err)
		}
		members = append(members, c)
	}
	extra := ClientInfo{ID: xid.New(), Write: make(chan outgoing.Message, 1000)}
	if err := (&Join{ID: room.ID}).Execute(r, extra); err == nil {
		t.Fatal("13th member admitted")
	}
	// Drain all signals continuously so the scenario is not limited by test buffers.
	for _, c := range members {
		go func(c ClientInfo) {
			for range c.Write {
			}
		}(c)
		defer close(c.Write)
	}
	for i, c := range members {
		if err := (&StartShare{Kind: "voice"}).Execute(r, c); err != nil {
			t.Fatalf("voice %d: %v", i, err)
		}
		err := (&StartShare{}).Execute(r, c)
		if (err == nil) != (i < 6) {
			t.Fatalf("presenter %d: %v", i, err)
		}
	}
	voices, media := 0, 0
	for _, s := range room.Sessions {
		if s.Kind == "voice" {
			voices++
		}
		if s.Kind == "media" {
			media++
		}
	}
	if voices != 12*11 || media != 6*11 {
		t.Fatalf("sessions voice=%d media=%d", voices, media)
	}
	if err := (&MediaSeat{Active: true}).Execute(r, members[6]); err == nil {
		t.Fatal("seventh seat admitted")
	}
	if err := (&StopShare{}).Execute(r, a); err != nil {
		t.Fatal(err)
	}
	if err := (&StartShare{Playback: true}).Execute(r, a); err != nil {
		t.Fatal(err)
	}
	if room.Playback == nil || room.Playback.From != a.ID {
		t.Fatal("playback not reserved at share start")
	}
	if err := (&StopShare{}).Execute(r, b); err != nil {
		t.Fatal(err)
	}
	if err := (&StartShare{Playback: true}).Execute(r, b); err == nil {
		t.Fatal("second playback admitted")
	}
	if err := (&StartShare{}).Execute(r, b); err != nil {
		t.Fatal("playback blocked ordinary sharing", err)
	}
	if err := (&RoomMessage{Kind: "playback", Data: json.RawMessage(`{"action":"stop"}`)}).Execute(r, b); err == nil {
		t.Fatal("ordinary presenter stopped another playback")
	}
	if err := (&MediaSeat{Active: false}).Execute(r, a); err != nil {
		t.Fatal(err)
	}
	if room.Playback != nil || !room.Users[a.ID].VoiceActive {
		t.Fatal("seat leave did not release playback and preserve voice")
	}
	if err := (&StopShare{}).Execute(r, b); err != nil {
		t.Fatal(err)
	}
	if err := (&StartShare{Playback: true}).Execute(r, b); err != nil {
		t.Fatal("playback lock not released", err)
	}
	if err := (&MediaSeat{Active: true}).Execute(r, members[6]); err != nil {
		t.Fatal("released seat unavailable", err)
	}
}

func TestConfiguredRoomCapacity(t *testing.T) {
	r, _, b := auditRoom()
	room := r.Rooms["audit"]
	room.MemberLimit = 3
	room.MediaSeatLimit = 2
	c := ClientInfo{ID: xid.New(), Write: make(chan outgoing.Message, 100)}
	if err := (&Join{ID: room.ID}).Execute(r, c); err != nil {
		t.Fatal(err)
	}
	snapshot := (<-c.Write).(outgoing.Room)
	if snapshot.MaxMembers != 3 || snapshot.MaxMediaSeats != 2 || room.Users[c.ID].MediaActive {
		t.Fatal("configured limits not advertised or enforced")
	}
	d := ClientInfo{ID: xid.New(), Write: make(chan outgoing.Message, 100)}
	if err := (&Join{ID: room.ID}).Execute(r, d); err == nil {
		t.Fatal("configured room limit ignored")
	}
	if err := (&MediaSeat{Active: true}).Execute(r, c); err == nil {
		t.Fatal("configured media limit ignored")
	}
	if err := (&StartShare{Kind: "voice"}).Execute(r, c); err != nil {
		t.Fatal(err)
	}
	if err := (&MediaSeat{Active: false}).Execute(r, b); err != nil {
		t.Fatal(err)
	}
	if err := (&MediaSeat{Active: true}).Execute(r, c); err != nil {
		t.Fatal(err)
	}
}

func TestCreatedRoomAdvertisesTwelveConfiguredSeats(t *testing.T) {
	r, _, _ := auditRoom()
	r.config.AuthMode = "none"
	r.config.MaxRoomMembers = 12
	r.config.MaxMediaSeats = 12
	owner := ClientInfo{ID: xid.New(), Write: make(chan outgoing.Message, 100)}
	if err := (&Create{ID: "configured", Mode: ConnectionLocal}).Execute(r, owner); err != nil {
		t.Fatal(err)
	}
	snapshot, ok := (<-owner.Write).(outgoing.Room)
	if !ok || snapshot.MaxMembers != 12 || snapshot.MaxMediaSeats != 12 {
		t.Fatalf("wrong menu limits: %#v", snapshot)
	}
}
