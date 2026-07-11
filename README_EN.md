# GitDesktop

A lightweight native desktop client for GitHub, built with [Wails](https://wails.io/) (Go backend + a plain JavaScript web frontend). The goal is a simple local UI for everyday GitHub and git work without dropping to the terminal.

## Features

- Browse and manage your GitHub repositories (via OAuth device flow).
- Local git operations: change status, commit history, file tree, README.
- Clone and create repositories.
- Automatic updates from GitHub Releases:
  - `.deb` installs to the portable binary at `~/.local/bin/gitdesktop`;
  - `.AppImage` updates in place (the file overwrites itself);
  - when no package is present, a raw built binary is used.

## Requirements

Both `.deb` and `.AppImage` require the system library `libwebkit2gtk-4.1-0`:

```bash
sudo apt install libwebkit2gtk-4.1-0 git
```

## Installation

### AppImage

Download `gitdesktop-<version>-x86_64.AppImage` from the Releases section, make it executable and run it:

```bash
chmod +x gitdesktop-*.AppImage
./gitdesktop-*.AppImage
```

### Debian / Ubuntu (.deb)

```bash
sudo apt install ./gitdesktop_<version>_amd64.deb
```

### From source

Requires Go 1.21+ and Wails installed:

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
wails build
```

## Building a release

```bash
make all       # build .deb and .AppImage (+ raw binary)
make release   # publish artifacts to GitHub Releases (requires `gh auth login`)
```

## Auto-update

On startup the app compares its version (from `VERSION`) with the latest GitHub release tag. If a newer version is available it is downloaded and installed automatically: in place for AppImage, or to `~/.local/bin/gitdesktop` for deb/portable builds.

## License

Distributed under the **GPL-3.0** license. See [LICENSE](LICENSE).
