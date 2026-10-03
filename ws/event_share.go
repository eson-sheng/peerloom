package ws

import (
	"fmt"

	"github.com/peerloom/server/ws/outgoing"
)

func init() {
	register("share", func() Event {
		return &StartShare{}
	})
}

type StartShare struct {
	Kind     string `json:"kind,omitempty"`
	Playback bool   `json:"playback,omitempty"`
}

func (e *StartShare) Execute(rooms *Rooms, current ClientInfo) error {
	room, err := rooms.CurrentRoom(current)
	if err != nil {
		return err
	}
	if !room.Users[current.ID].MediaEnabled {
		return fmt.Errorf("房主已关闭你的媒体权限")
	}
	if e.Kind != "voice" && !room.Users[current.ID].MediaActive {
		return fmt.Errorf("请先进入实时媒体区，再开始共享")
	}
	kind := e.Kind
	if kind == "" {
		kind = "media"
	}
	if kind != "media" && kind != "voice" {
		return fmt.Errorf("不支持的媒体类型")
	}
	if e.Playback && kind != "media" {
		return fmt.Errorf("同播必须使用内容媒体")
	}
	if e.Playback && room.Playback != nil && room.Playback.From != current.ID {
		return fmt.Errorf("已有成员正在同播，请等待其结束")
	}

	if kind == "media" && room.Users[current.ID].Streaming {
		if e.Playback != (room.Playback != nil && room.Playback.From == current.ID) {
			return fmt.Errorf("请先结束当前内容共享")
		}
		return nil
	}
	if kind == "voice" && room.Users[current.ID].VoiceActive {
		return nil
	}

	v4, v6, err := rooms.config.TurnIPProvider.Get()
	if err != nil {
		return err
	}

	if e.Playback {
		room.Playback = &outgoing.PlaybackState{From: current.ID, Rate: 1, Paused: true}
	}
	if kind == "voice" {
		room.Users[current.ID].VoiceActive = true
	} else {
		room.Users[current.ID].Streaming = true
	}

	for _, user := range room.Users {
		if current.ID == user.ID {
			continue
		}
		room.newSession(current.ID, user.ID, rooms, v4, v6, kind)
	}

	room.notifyInfoChanged()
	return nil
}
