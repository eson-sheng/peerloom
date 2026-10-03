package cmd

import (
	"os"

	"github.com/peerloom/server/auth"
	"github.com/peerloom/server/config"
	"github.com/peerloom/server/logger"
	"github.com/peerloom/server/router"
	"github.com/peerloom/server/server"
	"github.com/peerloom/server/turn"
	"github.com/peerloom/server/ws"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/urfave/cli"
)

func serveCmd(version string) cli.Command {
	return cli.Command{
		Name: "serve",
		Action: func(ctx *cli.Context) {
			conf, errs := config.Get()
			logger.Init(conf.LogLevel.AsZeroLogLevel())

			exit := false
			for _, err := range errs {
				log.WithLevel(err.Level).Msg(err.Msg)
				exit = exit || err.Level == zerolog.FatalLevel || err.Level == zerolog.PanicLevel
			}
			if exit {
				os.Exit(1)
			}

			if _, _, err := conf.TurnIPProvider.Get(); err != nil {
				// error is already logged by .Get()
				os.Exit(1)
			}

			users, err := auth.ReadPasswordsFile(conf.UsersFile, conf.Secret, conf.SessionTimeoutSeconds)
			if err != nil {
				log.Fatal().Str("file", conf.UsersFile).Err(err).Msg("While loading users file")
			}

			tServer, err := turn.Start(conf)
			if err != nil {
				log.Fatal().Err(err).Msg("could not start turn server")
			}

			rooms := ws.NewRooms(tServer, users, conf)

			go rooms.Start()

			r := router.Router(conf, rooms, users, version)
			if err := server.Start(r, conf.ServerAddress, conf.TLSCertFile, conf.TLSKeyFile); err != nil {
				log.Fatal().Err(err).Msg("http server")
			}
		},
	}
}
