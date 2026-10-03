package auth

import (
	"encoding/csv"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"

	"github.com/gorilla/sessions"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/bcrypt"
)

type Users struct {
	Lookup         map[string]string
	store          sessions.Store
	sessionTimeout int
}

type UserPW struct {
	Name string
	Pass string
}

func read(r io.Reader) ([]UserPW, error) {
	reader := csv.NewReader(r)
	reader.Comma = ':'
	reader.Comment = '#'
	reader.TrimLeadingSpace = true

	records, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}

	result := []UserPW{}
	for _, record := range records {
		if len(record) != 2 {
			return nil, errors.New("用户文件格式不正确")
		}
		result = append(result, UserPW{Name: record[0], Pass: record[1]})
	}
	return result, nil
}

func ReadPasswordsFile(path string, secret []byte, sessionTimeout int) (*Users, error) {
	users := &Users{
		Lookup:         map[string]string{},
		sessionTimeout: sessionTimeout,
		store:          sessions.NewCookieStore(secret),
	}
	if path == "" {
		log.Info().Msg("未指定用户文件")
		return users, nil
	}

	file, err := os.Open(path)
	if err != nil {
		return users, err
	}
	defer file.Close()
	userPws, err := read(file)
	if err != nil {
		return users, err
	}

	for _, record := range userPws {
		users.Lookup[record.Name] = record.Pass
	}
	log.Info().Int("amount", len(users.Lookup)).Msg("用户已加载")
	return users, nil
}

type Response struct {
	Message string `json:"message"`
}

func (u *Users) CurrentUser(r *http.Request) (string, bool) {
	s, _ := u.store.Get(r, "user")
	user, ok := s.Values["user"].(string)
	if !ok {
		return "guest", ok
	}
	return user, ok
}

func (u *Users) Logout(w http.ResponseWriter, r *http.Request) {
	session := sessions.NewSession(u.store, "user")
	session.IsNew = true
	if err := u.store.Save(r, w, session); err != nil {
		w.WriteHeader(500)
		_ = json.NewEncoder(w).Encode(&Response{
			Message: "退出登录失败，请稍后重试",
		})
		return
	}
	w.WriteHeader(200)
}

func (u *Users) Authenticate(w http.ResponseWriter, r *http.Request) {
	user := r.FormValue("user")
	pass := r.FormValue("pass")

	if !u.Validate(user, pass) {
		w.WriteHeader(401)
		_ = json.NewEncoder(w).Encode(&Response{
			Message: "用户名或密码错误",
		})
		return
	}

	session := sessions.NewSession(u.store, "user")
	session.IsNew = true
	session.Options.MaxAge = u.sessionTimeout
	session.Values["user"] = user
	if err := u.store.Save(r, w, session); err != nil {
		w.WriteHeader(500)
		_ = json.NewEncoder(w).Encode(&Response{
			Message: "登录失败，请稍后重试",
		})
		return
	}
	w.WriteHeader(200)
	_ = json.NewEncoder(w).Encode(&Response{
		Message: "身份验证成功",
	})
}

func (u Users) Validate(user, password string) bool {
	realPassword, exists := u.Lookup[user]
	return exists && bcrypt.CompareHashAndPassword([]byte(realPassword), []byte(password)) == nil
}
