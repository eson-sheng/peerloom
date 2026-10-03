package ws

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/peerloom/server/ws/outgoing"
	"github.com/rs/xid"
)

// RoomMessage is the server-side envelope for non-persistent collaboration
// events. It intentionally only carries control-plane data: file bytes stay in
// RTCDataChannels between the sender and recipients that accepted an offer.
type RoomMessage struct {
	Kind string          `json:"kind"`
	To   []xid.ID        `json:"to,omitempty"`
	Data json.RawMessage `json:"data"`
}

func init() {
	register("roommessage", func() Event { return &RoomMessage{} })
}

func (e *RoomMessage) Execute(rooms *Rooms, current ClientInfo) error {
	room, err := rooms.CurrentRoom(current)
	if err != nil {
		return err
	}
	if len(e.Kind) == 0 || len(e.Kind) > 64 || len(e.Data) > 256*1024 {
		return fmt.Errorf("房间消息格式无效")
	}

	// Reserve the names below for their own event types and reject arbitrary
	// signaling so this broadcast channel cannot become a WebRTC relay.
	allowed := map[string]bool{
		"chat": true, "typing": true, "link-status": true,
		"file-offer": true, "file-response": true, "file-cancel": true,
		"playback": true, "document-update": true, "whiteboard-update": true,
		"cursor": true,
	}
	if !allowed[e.Kind] || strings.TrimSpace(string(e.Data)) == "" || !json.Valid(e.Data) {
		return fmt.Errorf("不支持的房间消息")
	}
	if e.Kind == "playback" {
		if !room.Users[current.ID].Streaming || room.Playback == nil || room.Playback.From != current.ID {
			return fmt.Errorf("只有当前同播者可以控制同播")
		}
		if len(e.To) != 0 {
			return fmt.Errorf("同播状态必须同步给整个房间")
		}
		var data struct {
			Action      string  `json:"action"`
			CurrentTime float64 `json:"currentTime"`
			Duration    float64 `json:"duration"`
			Rate        float64 `json:"rate"`
			Paused      bool    `json:"paused"`
		}
		if err := json.Unmarshal(e.Data, &data); err != nil {
			return fmt.Errorf("同播状态格式无效")
		}
		switch data.Action {
		case "start", "play", "pause", "seek", "rate", "sync", "stop":
		default:
			return fmt.Errorf("未知同播操作")
		}
		if data.CurrentTime < 0 || data.Duration < 0 || data.Rate < 0 || data.Rate > 16 {
			return fmt.Errorf("同播进度无效")
		}
		if data.Rate == 0 {
			data.Rate = 1
		}
		if data.Duration > 0 && data.CurrentTime > data.Duration {
			data.CurrentTime = data.Duration
		}
		if data.Action == "stop" {
			room.Playback = nil
		} else {
			room.Playback = &outgoing.PlaybackState{From: current.ID, CurrentTime: data.CurrentTime, Duration: data.Duration, Rate: data.Rate, Paused: data.Paused || data.Action == "pause", UpdatedAt: time.Now().UnixMilli()}
		}
		room.notifyInfoChanged()
	}

	// Targeted control messages are delivered only to valid members. Chat and
	// collaboration broadcasts use an empty recipient list.
	for _, id := range e.To {
		if _, ok := room.Users[id]; !ok {
			return fmt.Errorf("消息接收者不在当前房间")
		}
	}
	message := outgoing.RoomMessage{Kind: e.Kind, From: current.ID, To: e.To, Data: e.Data, At: time.Now().UnixMilli()}
	if len(e.To) == 0 {
		for _, user := range room.Users {
			user.WriteTimeout(message)
		}
		return nil
	}
	for _, id := range e.To {
		room.Users[id].WriteTimeout(message)
	}
	// The sender needs a local acknowledgement to render delivery state.
	room.Users[current.ID].WriteTimeout(message)
	return nil
}
