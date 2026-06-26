package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync"
	"time"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type Config struct {
	Token          string                    `json:"token"`
	AvatarURL      string                    `json:"avatar_url"`
	ReposCache     []map[string]interface{}  `json:"repos_cache"`
	RepoPaths      map[string]string         `json:"repo_paths"`
	LastClonePath  string                    `json:"last_clone_path"`
	LastCreatePath string                    `json:"last_create_path"`
}

type App struct {
	ctx           context.Context
	client        *GitHubClient
	config        Config
	currentUser   string
	localRepo     *GitRepo
	localPath     string
	watcherMu     sync.Mutex
	watcherActive bool
}

func NewApp() *App {
	return &App{
		client: NewGitHubClient(),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.loadConfig()
	if a.config.Token != "" {
		a.client.SetToken(a.config.Token)
	}
}

func configPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "gitdesktop", "config.json")
}

func (a *App) loadConfig() {
	data, err := os.ReadFile(configPath())
	if err != nil {
		a.config = Config{RepoPaths: make(map[string]string)}
		return
	}
	json.Unmarshal(data, &a.config)
	if a.config.RepoPaths == nil {
		a.config.RepoPaths = make(map[string]string)
	}
}

func (a *App) saveConfig() error {
	path := configPath()
	os.MkdirAll(filepath.Dir(path), 0755)
	data, err := json.MarshalIndent(a.config, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

// ── AUTH ──────────────────────────────────────────────────────────────────

type LoginResult struct {
	OK        bool   `json:"ok"`
	User      string `json:"user"`
	AvatarURL string `json:"avatar_url"`
	Error     string `json:"error,omitempty"`
}

func (a *App) GetSavedToken() string {
	return a.config.Token
}

func (a *App) Login(token string) LoginResult {
	a.client.SetToken(token)
	ok, user := a.client.Authenticate()
	if !ok {
		return LoginResult{OK: false, Error: user}
	}

	a.currentUser = user
	a.config.Token = token

	u, err := a.client.GetCurrentUser()
	if err == nil {
		if avatar, ok := u["avatar_url"].(string); ok {
			a.config.AvatarURL = avatar
		}
	}
	a.saveConfig()

	return LoginResult{OK: true, User: user, AvatarURL: a.config.AvatarURL}
}

func (a *App) Logout() map[string]interface{} {
	a.currentUser = ""
	a.localRepo = nil
	a.localPath = ""
	a.config.Token = ""
	a.saveConfig()
	return map[string]interface{}{"ok": true}
}

func (a *App) GetCurrentUser() string {
	return a.currentUser
}

// ── REPOS ─────────────────────────────────────────────────────────────────

type ReposResult struct {
	OK    bool                     `json:"ok"`
	Repos []map[string]interface{} `json:"repos"`
	Error string                   `json:"error,omitempty"`
}

func (a *App) GetRepos() ReposResult {
	repos, err := a.client.GetUserRepos(1, 30)
	if err != nil {
		return ReposResult{OK: false, Error: err.Error()}
	}

	cached := make([]map[string]interface{}, 0)
	for _, r := range repos {
		c := make(map[string]interface{})
		for _, k := range []string{"name", "description", "language", "private", "html_url", "clone_url", "stargazers_count", "default_branch", "updated_at"} {
			if v, ok := r[k]; ok {
				c[k] = v
			}
		}
		cached = append(cached, c)
	}
	a.config.ReposCache = cached
	a.saveConfig()

	return ReposResult{OK: true, Repos: repos}
}

func (a *App) GetCachedRepos() []map[string]interface{} {
	return a.config.ReposCache
}

type CreateRepoResult struct {
	OK      bool   `json:"ok"`
	Error   string `json:"error,omitempty"`
	Started bool   `json:"started,omitempty"`
}

func (a *App) CreateRepo(name, description string, private, autoInit bool, gitignoreTemplate, branch, localPath string) CreateRepoResult {
	repo, err := a.client.CreateRepo(name, description, private, false)
	if err != nil {
		return CreateRepoResult{OK: false, Error: err.Error()}
	}

	cloneURL, _ := repo["clone_url"].(string)
	repoPath := localPath
	if filepath.Base(strings.TrimRight(localPath, "/")) != name {
		repoPath = filepath.Join(localPath, name)
	}

	go func() {
		if err := os.MkdirAll(repoPath, 0755); err != nil {
			a.emitEvent("onCreateRepoError", err.Error())
			return
		}

		var gitRepo *GitRepo
		if IsGitRepo(repoPath) {
			gitRepo, _ = OpenGitRepo(repoPath)
		} else {
			gitRepo, err = InitGitRepo(repoPath, branch)
			if err != nil {
				a.emitEvent("onCreateRepoError", err.Error())
				return
			}
		}

		if gitignoreTemplate != "" && gitignoreTemplate != "None" {
			if content, err := a.client.GetGitIgnoreTemplate(gitignoreTemplate); err == nil && content != "" {
				os.WriteFile(filepath.Join(repoPath, ".gitignore"), []byte(content), 0644)
			}
		}

		if autoInit {
			readmePath := filepath.Join(repoPath, "README.md")
			if _, err := os.Stat(readmePath); os.IsNotExist(err) {
				content := fmt.Sprintf("# %s\n", name)
				if description != "" {
					content = fmt.Sprintf("# %s\n\n%s\n", name, description)
				}
				os.WriteFile(readmePath, []byte(content), 0644)
			}
		}

		gitRepo.run("add", "-A")
		status, _ := gitRepo.Status()
		if strings.TrimSpace(status) != "" {
			gitRepo.Commit("Initial commit", "")
		} else if !gitRepo.headValid() {
			os.WriteFile(filepath.Join(repoPath, "README.md"), []byte(fmt.Sprintf("# %s\n", name)), 0644)
			gitRepo.run("add", "-A")
			gitRepo.Commit("Initial commit", "")
		}

		token := a.config.Token
		pushURL := cloneURL
		if token != "" {
			pushURL = strings.Replace(cloneURL, "https://", "https://"+token+"@", 1)
		}
		gitRepo.RemoveRemote("origin")
		gitRepo.AddRemote("origin", pushURL)
		if gitRepo.headValid() {
			branchName, _, _ := gitRepo.BranchInfo()
			gitRepo.Push("", branchName)
		}
		gitRepo.SetRemoteURL("origin", cloneURL)

		a.config.RepoPaths[name] = repoPath
		a.config.LastCreatePath = filepath.Dir(strings.TrimRight(repoPath, "/"))
		a.saveConfig()

		a.emitEvent("onCreateRepoSuccess", name)
	}()

	return CreateRepoResult{OK: true, Started: true}
}

type DeleteResult struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

func (a *App) DeleteRepo(owner, repo string) DeleteResult {
	err := a.client.DeleteRepo(owner, repo)
	if err != nil {
		return DeleteResult{OK: false, Error: err.Error()}
	}
	return DeleteResult{OK: true}
}

func (a *App) GetGitIgnoreTemplates() []string {
	templates, err := a.client.GetGitIgnoreTemplates()
	if err != nil {
		return []string{"None"}
	}
	return append([]string{"None"}, templates...)
}

// ── LOCAL REPO ────────────────────────────────────────────────────────────

type OpenRepoResult struct {
	OK    bool   `json:"ok"`
	Path  string `json:"path"`
	Error string `json:"error,omitempty"`
}

func (a *App) OpenLocalRepo(path string) OpenRepoResult {
	repo, err := OpenGitRepo(path)
	if err != nil {
		return OpenRepoResult{OK: false, Error: err.Error()}
	}
	a.localRepo = repo
	a.localPath = path
	return OpenRepoResult{OK: true, Path: path}
}

func (a *App) GetSavedRepoPath(repoName string) string {
	return a.config.RepoPaths[repoName]
}

type CloneResult struct {
	OK      bool   `json:"ok"`
	Error   string `json:"error,omitempty"`
	Started bool   `json:"started,omitempty"`
}

func (a *App) CloneRepo(url, dest string) CloneResult {
	go func() {
		err := Clone(url, dest)
		if err != nil {
			a.emitEvent("onCloneError", err.Error())
			return
		}
		a.config.LastClonePath = filepath.Dir(dest)
		a.saveConfig()
		a.emitEvent("onCloneSuccess", dest)
	}()
	return CloneResult{OK: true, Started: true}
}

func (a *App) GetLastClonePath() string {
	if a.config.LastClonePath != "" {
		return a.config.LastClonePath
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "projects")
}

type ChangesResult struct {
	OK      bool         `json:"ok"`
	Changes []ChangeInfo `json:"changes"`
	Error   string       `json:"error,omitempty"`
}

func (a *App) GetChanges() ChangesResult {
	if a.localRepo == nil {
		return ChangesResult{OK: false, Error: "No local repo"}
	}
	changes, err := a.localRepo.Changes()
	if err != nil {
		return ChangesResult{OK: false, Error: err.Error()}
	}
	return ChangesResult{OK: true, Changes: changes}
}

type DiffResult struct {
	OK   bool   `json:"ok"`
	Diff string `json:"diff"`
}

func (a *App) GetDiff(filepath string) DiffResult {
	if a.localRepo == nil {
		return DiffResult{OK: false}
	}
	diff, err := a.localRepo.Diff(filepath)
	if err != nil {
		return DiffResult{OK: false, Diff: err.Error()}
	}
	return DiffResult{OK: true, Diff: diff}
}

type CommitResult struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

func (a *App) Commit(message, description string) CommitResult {
	if a.localRepo == nil {
		return CommitResult{OK: false, Error: "No local repo"}
	}

	if err := a.localRepo.Commit(message, description); err != nil {
		return CommitResult{OK: false, Error: err.Error()}
	}

	go func() {
		originURL, _ := a.localRepo.run("remote", "get-url", "origin")
		token := a.config.Token
		pushURL := originURL
		if token != "" && strings.HasPrefix(originURL, "https://") {
			pushURL = strings.Replace(originURL, "https://", "https://"+token+"@", 1)
		}
		branch, _, _ := a.localRepo.BranchInfo()
		err := a.localRepo.Push(pushURL, branch)
		if err != nil {
			a.emitEvent("onPushError", err.Error())
			return
		}
		a.emitEvent("onPushSuccess", "")
	}()

	return CommitResult{OK: true}
}

type PushResult struct {
	OK      bool   `json:"ok"`
	Error   string `json:"error,omitempty"`
	Started bool   `json:"started,omitempty"`
}

func (a *App) Push() PushResult {
	if a.localRepo == nil {
		return PushResult{OK: false, Error: "No local repo"}
	}

	go func() {
		originURL, _ := a.localRepo.run("remote", "get-url", "origin")
		token := a.config.Token
		pushURL := originURL
		if token != "" && strings.HasPrefix(originURL, "https://") {
			pushURL = strings.Replace(originURL, "https://", "https://"+token+"@", 1)
		}
		branch, _, _ := a.localRepo.BranchInfo()
		err := a.localRepo.Push(pushURL, branch)
		if err != nil {
			a.emitEvent("onPushError", err.Error())
			return
		}
		a.emitEvent("onPushSuccess", "")
	}()

	return PushResult{OK: true, Started: true}
}

type FetchResult struct {
	OK      bool   `json:"ok"`
	Error   string `json:"error,omitempty"`
	Started bool   `json:"started,omitempty"`
}

func (a *App) Fetch() FetchResult {
	if a.localRepo == nil {
		return FetchResult{OK: false, Error: "No local repo"}
	}

	go func() {
		err := a.localRepo.Fetch()
		if err != nil {
			a.emitEvent("onFetchError", err.Error())
			return
		}
		a.emitEvent("onFetchSuccess", "")
	}()

	return FetchResult{OK: true, Started: true}
}

type BranchInfoResult struct {
	Branch string `json:"branch"`
	Ahead  int    `json:"ahead"`
	Behind int    `json:"behind"`
}

func (a *App) GetBranchInfo() BranchInfoResult {
	if a.localRepo == nil {
		return BranchInfoResult{}
	}
	branch, ahead, behind := a.localRepo.BranchInfo()
	return BranchInfoResult{Branch: branch, Ahead: ahead, Behind: behind}
}

func (a *App) GetBranches() []string {
	if a.localRepo == nil {
		return nil
	}
	branches, _ := a.localRepo.Branches()
	return branches
}

type CheckoutResult struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

func (a *App) CheckoutBranch(branch string) CheckoutResult {
	if a.localRepo == nil {
		return CheckoutResult{OK: false, Error: "No local repo"}
	}
	err := a.localRepo.Checkout(branch)
	if err != nil {
		return CheckoutResult{OK: false, Error: err.Error()}
	}
	return CheckoutResult{OK: true}
}

type CommitDiffResult struct {
	OK   bool   `json:"ok"`
	Diff string `json:"diff"`
}

func (a *App) GetCommitDiff(sha string) CommitDiffResult {
	if a.localRepo == nil {
		return CommitDiffResult{OK: false}
	}
	diff, err := a.localRepo.CommitDiff(sha)
	if err != nil {
		return CommitDiffResult{OK: false, Diff: err.Error()}
	}
	return CommitDiffResult{OK: true, Diff: diff}
}

func (a *App) GetHistory() []CommitInfo {
	if a.localRepo == nil {
		return nil
	}
	history, _ := a.localRepo.History(50)
	return history
}

func (a *App) OpenInBrowser(url string) {
	go func() {
		switch goruntime.GOOS {
		case "darwin":
			exec.Command("open", url).Start()
		case "windows":
			exec.Command("cmd", "/c", "start", url).Start()
		default:
			exec.Command("xdg-open", url).Start()
		}
	}()
}

func (a *App) OpenInFiles(path string) map[string]interface{} {
	if path == "" || !pathExists(path) {
		return map[string]interface{}{"ok": false, "error": "Path not found"}
	}
	go func() {
		switch goruntime.GOOS {
		case "darwin":
			exec.Command("open", path).Start()
		default:
			exec.Command("xdg-open", path).Start()
		}
	}()
	return map[string]interface{}{"ok": true}
}

func (a *App) GetLocalPath() string {
	return a.localPath
}

func (a *App) GetConfig() map[string]interface{} {
	return map[string]interface{}{
		"token":           a.config.Token,
		"avatar_url":      a.config.AvatarURL,
		"last_clone_path": a.config.LastClonePath,
		"last_create_path": a.config.LastCreatePath,
		"repo_paths":      a.config.RepoPaths,
	}
}

func (a *App) SaveConfigKey(key string, value interface{}) map[string]interface{} {
	switch key {
	case "last_clone_path":
		if v, ok := value.(string); ok {
			a.config.LastClonePath = v
		}
	case "last_create_path":
		if v, ok := value.(string); ok {
			a.config.LastCreatePath = v
		}
	}
	a.saveConfig()
	return map[string]interface{}{"ok": true}
}

// ── FILE WATCHER ──────────────────────────────────────────────────────────

func (a *App) StartWatcher() map[string]interface{} {
	a.watcherMu.Lock()
	a.watcherActive = true
	a.watcherMu.Unlock()

	go func() {
		lastStatus := ""
		for {
			a.watcherMu.Lock()
			active := a.watcherActive
			a.watcherMu.Unlock()
			if !active {
				return
			}

			if a.localPath != "" && pathExists(a.localPath) {
				cmd := exec.Command("git", "-C", a.localPath, "status", "--porcelain")
				if out, err := cmd.CombinedOutput(); err == nil {
					newStatus := string(out)
					if lastStatus != "" && newStatus != lastStatus {
						a.emitEvent("onFileChanged", "")
					}
					lastStatus = newStatus
				}
			}
			time.Sleep(2 * time.Second)
		}
	}()

	return map[string]interface{}{"ok": true}
}

func (a *App) StopWatcher() map[string]interface{} {
	a.watcherMu.Lock()
	a.watcherActive = false
	a.watcherMu.Unlock()
	return map[string]interface{}{"ok": true}
}

// ── HELPERS ───────────────────────────────────────────────────────────────

func pathExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func (a *App) emitEvent(event string, data interface{}) {
	if a.ctx == nil {
		return
	}
	wruntime.EventsEmit(a.ctx, event, data)
}

// ── AUTO-UPDATE ───────────────────────────────────────────────────────────

type UpdateInfo struct {
	CurrentVersion  string `json:"current_version"`
	LatestVersion   string `json:"latest_version"`
	UpdateAvailable bool   `json:"update_available"`
	ReleaseURL      string `json:"release_url"`
	ReleaseNotes    string `json:"release_notes"`
	Error           string `json:"error,omitempty"`
}

func (a *App) GetVersion() string {
	return version
}

func (a *App) CheckForUpdates() UpdateInfo {
	info := UpdateInfo{
		CurrentVersion: version,
	}

	release, err := a.client.GetLatestRelease("bashakul", "gitdesktop")
	if err != nil {
		info.Error = err.Error()
		return info
	}

	latest := release.TagName
	if len(latest) > 0 && latest[0] == 'v' {
		latest = latest[1:]
	}
	info.LatestVersion = latest
	info.ReleaseURL = release.HTMLURL
	info.ReleaseNotes = release.Body
	info.UpdateAvailable = latest != "" && latest != version

	return info
}

func (a *App) DownloadUpdate() map[string]interface{} {
	release, err := a.client.GetLatestRelease("bashakul", "gitdesktop")
	if err != nil {
		return map[string]interface{}{"ok": false, "error": err.Error()}
	}

	exePath, err := os.Executable()
	if err != nil {
		return map[string]interface{}{"ok": false, "error": err.Error()}
	}

	exeDir := filepath.Dir(exePath)
	tmpPath := filepath.Join(exeDir, ".gitdesktop-update")

	go func() {
		defer os.Remove(tmpPath)

		assetName := "gitdesktop"
		var downloadURL string
		for _, asset := range release.Assets {
			if asset.Name == assetName || asset.Name == "gitdesktop-x86_64" {
				downloadURL = asset.BrowserDownloadURL
				break
			}
		}
		if downloadURL == "" && len(release.Assets) > 0 {
			for _, asset := range release.Assets {
				if strings.Contains(asset.Name, "linux") || strings.Contains(asset.Name, "x86_64") || strings.Contains(asset.Name, "amd64") {
					downloadURL = asset.BrowserDownloadURL
					break
				}
			}
		}
		if downloadURL == "" && len(release.Assets) > 0 {
			downloadURL = release.Assets[0].BrowserDownloadURL
		}

		if downloadURL == "" {
			a.emitEvent("onUpdateError", "No downloadable asset found")
			return
		}

		a.emitEvent("onUpdateProgress", map[string]interface{}{
			"percent":  0,
			"message":  "Downloading update...",
		})

		resp, err := http.Get(downloadURL)
		if err != nil {
			a.emitEvent("onUpdateError", err.Error())
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			a.emitEvent("onUpdateError", fmt.Sprintf("Download failed: HTTP %d", resp.StatusCode))
			return
		}

		out, err := os.Create(tmpPath)
		if err != nil {
			a.emitEvent("onUpdateError", err.Error())
			return
		}
		defer out.Close()

		total := resp.ContentLength
		written := int64(0)
		buf := make([]byte, 32*1024)
		for {
			n, readErr := resp.Body.Read(buf)
			if n > 0 {
				out.Write(buf[:n])
				written += int64(n)
				pct := 0
				if total > 0 {
					pct = int(written * 100 / total)
				}
				a.emitEvent("onUpdateProgress", map[string]interface{}{
					"percent": pct,
					"message": fmt.Sprintf("Downloading... %d%%", pct),
				})
			}
			if readErr != nil {
				break
			}
		}
		out.Close()

		os.Chmod(tmpPath, 0755)

		bakPath := exePath + ".bak"
		os.Remove(bakPath)
		if err := os.Rename(exePath, bakPath); err != nil {
			a.emitEvent("onUpdateError", "Failed to backup current binary: "+err.Error())
			return
		}
		if err := os.Rename(tmpPath, exePath); err != nil {
			os.Rename(bakPath, exePath)
			a.emitEvent("onUpdateError", "Failed to replace binary: "+err.Error())
			return
		}

		a.emitEvent("onUpdateDone", "restart")

		go func() {
			time.Sleep(500 * time.Millisecond)
			cmd := exec.Command(exePath)
			cmd.Start()
			os.Exit(0)
		}()
	}()

	return map[string]interface{}{"ok": true, "started": true}
}
