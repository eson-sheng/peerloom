package ws

import (
	"github.com/peerloom/server/ws/outgoing"
	"github.com/rs/xid"
	"testing"
)

func TestVoiceDoesNotBlockInvitedMemberSharing(t *testing.T) {
	r, owner, guest := auditRoom()
	room := r.Rooms["audit"]
	delete(room.Users, guest.ID)
	delete(r.connected, guest.ID)
	if err := (&StartShare{Kind: "voice"}).Execute(r, owner); err != nil {
		t.Fatal(err)
	}
	if room.Users[owner.ID].Streaming || !room.Users[owner.ID].VoiceActive {
		t.Fatal("voice acquired content slot")
	}
	if err := (&Join{ID: room.ID}).Execute(r, guest); err != nil {
		t.Fatal(err)
	}
	if err := (&StartShare{}).Execute(r, guest); err != nil {
		t.Fatalf("guest playback blocked by owner voice: %v", err)
	}
	if !room.Users[guest.ID].Streaming {
		t.Fatal("guest did not acquire content slot")
	}
	voice, media := false, false
	for _, session := range room.Sessions {
		voice = voice || session.Kind == "voice" && session.Host == owner.ID && session.Client == guest.ID
		media = media || session.Kind == "media" && session.Host == guest.ID && session.Client == owner.ID
	}
	if !voice || !media {
		t.Fatal("missing simultaneous voice and content sessions")
	}
	// A second microphone is allowed while the guest is sharing content.
	if err := (&StartShare{Kind: "voice"}).Execute(r, guest); err != nil {
		t.Fatal(err)
	}
	// Screen and camera presenters can share concurrently.
	if err := (&StartShare{}).Execute(r, owner); err != nil {
		t.Fatal(err)
	}
}

func TestVoiceAndContentStopIndependently(t *testing.T) {
	for _, stop := range []string{"voice", "media"} {
		t.Run(stop, func(t *testing.T) {
			r, a, b := auditRoom()
			room := r.Rooms["audit"]
			for _, kind := range []string{"voice", "media"} {
				if err := (&StartShare{Kind: kind}).Execute(r, a); err != nil {
					t.Fatal(err)
				}
			}
			data := xid.New()
			room.Sessions[data] = &RoomSession{Host: a.ID, Client: b.ID, Kind: "data"}
			before := len(room.Sessions)
			if err := (&StartShare{Kind: stop}).Execute(r, a); err != nil {
				t.Fatal(err)
			}
			if len(room.Sessions) != before {
				t.Fatal("repeated start created duplicate sessions")
			}
			if err := (&StopShare{Kind: stop}).Execute(r, a); err != nil {
				t.Fatal(err)
			}
			if room.Users[a.ID].VoiceActive != (stop != "voice") || room.Users[a.ID].Streaming != (stop != "media") {
				t.Fatal("stopping one kind changed the other")
			}
			for _, session := range room.Sessions {
				if session.Kind == stop {
					t.Fatal("stopped session remains")
				}
			}
			if len(room.Sessions) != 2 || room.Sessions[data] == nil {
				t.Fatal("unrelated sessions removed")
			}
		})
	}
}

func TestRevocationStopsAllMediaButSeatLeavePreservesVoice(t *testing.T) {
	for _, revoke := range []bool{true, false} {
		r, a, b := auditRoom()
		room := r.Rooms["audit"]
		for _, kind := range []string{"voice", "media"} {
			if err := (&StartShare{Kind: kind}).Execute(r, b); err != nil {
				t.Fatal(err)
			}
		}
		var err error
		if revoke {
			err = (&RoomAdmin{Action: "media", Target: b.ID, MediaEnabled: false}).Execute(r, a)
		} else {
			err = (&MediaSeat{Active: false}).Execute(r, b)
		}
		if err != nil {
			t.Fatal(err)
		}
		if room.Users[b.ID].VoiceActive != !revoke || room.Users[b.ID].Streaming {
			t.Fatal("revoked media still active")
		}
		if err := (&StartShare{Kind: "voice"}).Execute(r, b); (err != nil) != revoke {
			t.Fatal("voice bypassed media permissions")
		}
	}
}

func TestVoiceFailureReportsOnlyVoiceOperation(t *testing.T) {
	r, a, _ := auditRoom()
	r.Rooms["audit"].Users[a.ID].MediaEnabled = false
	auditDispatch(r, a, &StartShare{Kind: "voice"})
	msg := <-a.Write
	failure, ok := msg.(outgoing.OperationError)
	if !ok || failure.Operation != "voice" {
		t.Fatalf("wrong failure operation: %#v", msg)
	}
	if r.connected[a.ID] != "audit" {
		t.Fatal("voice refusal disconnected member")
	}
}
