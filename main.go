package main

import (
	"embed"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed VERSION
var versionFile string

var version = strings.TrimSpace(versionFile)
var oauthClientID = "Iv23lijxKXrbkQ1Io2a5"

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:  "GitDesktop",
		Width:  1280,
		Height: 800,
		MinWidth: 900,
		MinHeight: 600,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 30, G: 34, B: 40, A: 1},
		OnStartup:        app.startup,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
