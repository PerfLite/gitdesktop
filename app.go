package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
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
	UserName       string                    `json:"user_name"`
	UserEmail      string                    `json:"user_email"`
	ReposCache     []map[string]interface{}  `json:"repos_cache"`
	RepoPaths      map[string]string         `json:"repo_paths"`
	LastClonePath  string                    `json:"last_clone_path"`
	LastCreatePath string                    `json:"last_create_path"`
	Theme          string                    `json:"theme"`
}

type App struct {
	ctx           context.Context
	client        *GitHubClient
	config        Config
	currentUser   string
	userName      string
	userEmail     string
	currentRepo   map[string]interface{}
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
		if u, err := a.client.GetCurrentUser(); err == nil {
			if login, ok := u["login"].(string); ok {
				a.currentUser = login
			}
			if name, ok := u["name"].(string); ok && name != "" {
				a.userName = name
			} else if login, ok := u["login"].(string); ok {
				a.userName = login
			}
			if email, ok := u["email"].(string); ok && email != "" {
				a.userEmail = email
			} else if login, ok := u["login"].(string); ok {
				a.userEmail = login + "@users.noreply.github.com"
			}
			a.config.UserName = a.userName
			a.config.UserEmail = a.userEmail
			a.saveConfig()
		} else {
			ok, user := a.client.Authenticate()
			if ok {
				a.currentUser = user
				a.userName = user
				a.userEmail = user + "@users.noreply.github.com"
			}
		}
		if a.userName == "" && a.config.UserName != "" {
			a.userName = a.config.UserName
			a.userEmail = a.config.UserEmail
		}
	}

	// Защита "последней линии" от петли перезапуска: считаем, сколько раз
	// процесс уже сам себя перезапускал в рамках одной цепочки запусков.
	// Независимо от того, сработает ли проверка путей ниже, после
	// нескольких попыток самозапуск гарантированно прекращается.
	const maxRestarts = 2
	restartCount := 0
	if v := os.Getenv("GITDESKTOP_RESTART_COUNT"); v != "" {
		fmt.Sscanf(v, "%d", &restartCount)
	}
	if restartCount >= maxRestarts {
		return
	}

	// Запущено из AppImage — оно самоуправляемое (обновляется на месте),
	// не перенаправляем запуск в ~/.local/bin/gitdesktop.
	// If we're on Windows, the updater is handled without ~/.local/bin/gitdesktop
	if goruntime.GOOS == "windows" {
		return
	}

	if os.Getenv("APPIMAGE") != "" {
		return
	}

	home, _ := os.UserHomeDir()
	updatedBin := filepath.Join(home, ".local", "bin", "gitdesktop")

	// os.Executable() не гарантирует разворачивание симлинков и может
	// вернуть путь, отличающийся от updatedBin даже если по факту это
	// тот же файл (другой регистр, относительный путь, симлинк и т.д.).
	// Поэтому сравниваем канонические (resolved) абсолютные пути, а не
	// делаем хрупкое сравнение строк через HasPrefix.
	rawExePath, _ := os.Executable()
	exePath, err := filepath.EvalSymlinks(rawExePath)
	if err != nil {
		exePath = rawExePath
	}
	resolvedUpdatedBin, err := filepath.EvalSymlinks(updatedBin)
	if err != nil {
		resolvedUpdatedBin = updatedBin
	}

	// Если мы уже и есть тот самый обновлённый бинарник — ничего не делаем.
	if exePath == resolvedUpdatedBin {
		return
	}

	if info, err := os.Stat(updatedBin); err == nil && info.Size() > 1000000 {
		// Не перезапускаем, если обновлённый бинарник не новее текущего —
		// иначе при равных/более старых файлах можно зациклиться повторно.
		curInfo, curErr := os.Stat(exePath)
		if curErr == nil && !info.ModTime().After(curInfo.ModTime()) {
			return
		}

		os.Chmod(updatedBin, 0755)
		go func() {
			time.Sleep(200 * time.Millisecond)
			cmd := exec.Command(updatedBin)
			cmd.Env = append(os.Environ(), fmt.Sprintf("GITDESKTOP_RESTART_COUNT=%d", restartCount+1))
			cmd.Start()
			os.Exit(0)
		}()
		return
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
		if name, ok := u["name"].(string); ok && name != "" {
			a.userName = name
		} else {
			a.userName = user
		}
		if email, ok := u["email"].(string); ok && email != "" {
			a.userEmail = email
		} else {
			a.userEmail = user + "@users.noreply.github.com"
		}
	} else {
		a.userName = user
		a.userEmail = user + "@users.noreply.github.com"
	}
	a.config.UserName = a.userName
	a.config.UserEmail = a.userEmail
	a.saveConfig()

	return LoginResult{OK: true, User: user, AvatarURL: a.config.AvatarURL}
}

func (a *App) Logout() map[string]interface{} {
	a.currentUser = ""
	a.userName = ""
	a.userEmail = ""
	a.localRepo = nil
	a.localPath = ""
	a.config.Token = ""
	a.config.UserName = ""
	a.config.UserEmail = ""
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
			gitRepo, _ = OpenGitRepo(repoPath, a.userName, a.userEmail)
		} else {
			gitRepo, err = InitGitRepo(repoPath, branch, a.userName, a.userEmail)
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
			if err := gitRepo.Commit("Initial commit", ""); err != nil {
				a.emitEvent("onCreateRepoError", "Commit failed: "+err.Error())
				return
			}
		} else if !gitRepo.headValid() {
			os.WriteFile(filepath.Join(repoPath, "README.md"), []byte(fmt.Sprintf("# %s\n", name)), 0644)
			gitRepo.run("add", "-A")
			if err := gitRepo.Commit("Initial commit", ""); err != nil {
				a.emitEvent("onCreateRepoError", "Commit failed: "+err.Error())
				return
			}
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
			pushOutput, pushErr := gitRepo.Push("", branchName)
			if pushErr != nil {
				a.emitEvent("onCreateRepoError", "Push failed: "+pushErr.Error()+" "+pushOutput)
				return
			}
		}
		gitRepo.SetRemoteURL("origin", cloneURL)

		a.config.RepoPaths[name] = repoPath
		a.config.LastCreatePath = filepath.Dir(strings.TrimRight(repoPath, "/"))
		a.localRepo = gitRepo
		a.localPath = repoPath
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
	repo, err := OpenGitRepo(path, a.userName, a.userEmail)
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
		if err := a.doPush(); err != nil {
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

func (a *App) doPush() error {
	originURL, err := a.localRepo.run("remote", "get-url", "origin")
	if err != nil || strings.TrimSpace(originURL) == "" {
		if err == nil {
			err = fmt.Errorf("empty remote URL")
		}
		return fmt.Errorf("cannot get remote URL: %w", err)
	}
	originURL = strings.TrimSpace(originURL)
	token := a.config.Token
	if token != "" && strings.HasPrefix(originURL, "https://") {
		pushURL := strings.Replace(originURL, "https://", "https://"+token+"@", 1)
		a.localRepo.SetRemoteURL("origin", pushURL)
		defer a.localRepo.SetRemoteURL("origin", originURL)
	}
	branch, _, _ := a.localRepo.BranchInfo()
	branch = strings.TrimSpace(branch)
	if branch == "" || branch == "unknown" {
		return fmt.Errorf("cannot determine current branch")
	}
	output, err := a.localRepo.Push("", branch)
	if err != nil {
		return fmt.Errorf("%s: %w", output, err)
	}
	return nil
}

func (a *App) Push() PushResult {
	if a.localRepo == nil {
		return PushResult{OK: false, Error: "No local repo"}
	}

	go func() {
		if err := a.doPush(); err != nil {
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
	absPath, err := filepath.Abs(path)
	if err != nil {
		absPath = path
	}
	go func() {
		switch goruntime.GOOS {
		case "darwin":
			exec.Command("open", absPath).Start()
		case "windows":
			exec.Command("explorer", absPath).Start()
		default:
			exec.Command("xdg-open", absPath).Start()
		}
	}()
	return map[string]interface{}{"ok": true}
}

func (a *App) GetLocalPath() string {
	return a.localPath
}

func (a *App) SetCurrentRepo(repo map[string]interface{}) {
	a.currentRepo = repo
	a.localRepo = nil
	a.localPath = ""
}

func (a *App) GetConfig() map[string]interface{} {
	return map[string]interface{}{
		"token":           a.config.Token,
		"avatar_url":      a.config.AvatarURL,
		"last_clone_path": a.config.LastClonePath,
		"last_create_path": a.config.LastCreatePath,
		"repo_paths":      a.config.RepoPaths,
		"theme":           a.config.Theme,
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
	case "repo_paths":
		if pathMap, ok := value.(map[string]interface{}); ok {
			for k, v := range pathMap {
				if strVal, ok := v.(string); ok {
					a.config.RepoPaths[k] = strVal
				}
			}
		}
	case "theme":
		if s, ok := value.(string); ok {
			a.config.Theme = s
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
				cmd := hiddenCmd("git", "-C", a.localPath, "status", "--porcelain")
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

	release, err := a.client.GetLatestRelease("PerfLite", "gitdesktop")
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
	release, err := a.client.GetLatestRelease("PerfLite", "gitdesktop")
	if err != nil {
		return map[string]interface{}{"ok": false, "error": err.Error()}
	}

	home, _ := os.UserHomeDir()
	tmpPath := filepath.Join(home, ".local", "bin", ".gitdesktop-update")
	os.MkdirAll(filepath.Dir(tmpPath), 0755)

	go func() {
		defer os.Remove(tmpPath)

		var downloadURL string
		var updatingAppImage bool
		appImagePath := os.Getenv("APPIMAGE")
		// Архивы (.deb/.rpm/.tar.*/.zip) неисполняемы — при самообновлении
		// их нельзя скачивать как бинарник. .AppImage обрабатываем отдельно.
		isArchive := func(name string) bool {
			lower := strings.ToLower(name)
			return strings.HasSuffix(lower, ".deb") ||
				strings.HasSuffix(lower, ".rpm") ||
				strings.HasSuffix(lower, ".tar.gz") ||
				strings.HasSuffix(lower, ".tgz") ||
				strings.HasSuffix(lower, ".zip")
		}
		// Запущено из AppImage — обновляем сам .AppImage на месте.
		if appImagePath != "" {
			for _, asset := range release.Assets {
				if strings.EqualFold(filepath.Ext(asset.Name), ".appimage") {
					downloadURL = asset.BrowserDownloadURL
					updatingAppImage = true
					break
				}
			}
		}
		// Иначе (deb/портативный бинарник) — сырой исполняемый файл.
		if downloadURL == "" {
			for _, asset := range release.Assets {
				if goruntime.GOOS == "windows" {
					if asset.Name == "gitdesktop.exe" || strings.HasSuffix(asset.Name, ".exe") {
						downloadURL = asset.BrowserDownloadURL
						break
					}
				} else {
					if asset.Name == "gitdesktop" || asset.Name == "gitdesktop-x86_64" {
						downloadURL = asset.BrowserDownloadURL
						break
					}
				}
			}
			// 2. Linux x86_64
			if downloadURL == "" && goruntime.GOOS != "windows" {
				for _, asset := range release.Assets {
					if isArchive(asset.Name) {
						continue
					}
					if strings.Contains(asset.Name, "linux") || strings.Contains(asset.Name, "x86_64") || strings.Contains(asset.Name, "amd64") {
						downloadURL = asset.BrowserDownloadURL
						break
					}
				}
			}
			// 3. Fallback
			if downloadURL == "" {
				for _, asset := range release.Assets {
					if !isArchive(asset.Name) {
						downloadURL = asset.BrowserDownloadURL
						break
					}
				}
			}
		}

		if downloadURL == "" {
			a.emitEvent("onUpdateError", "No downloadable asset found")
			return
		}

		a.emitEvent("onUpdateProgress", map[string]interface{}{
			"percent":  0,
			"message":  "Downloading update...",
		})

		req, err := http.NewRequest("GET", downloadURL, nil)
		if err != nil {
			a.emitEvent("onUpdateError", err.Error())
			return
		}
		req.Header.Set("User-Agent", "GitDesktop/0.1.0")

		resp, err := http.DefaultClient.Do(req)
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

		// Запущено из AppImage — перезаписываем сам .AppImage на месте.
		// Иначе ставим портативный бинарник.
		installPath := appImagePath
		if !updatingAppImage || appImagePath == "" {
			installPath, err = os.Executable()
			if err != nil {
				a.emitEvent("onUpdateError", "Failed to get executable path: "+err.Error())
				return
			}
		}

		if err := installUpdate(tmpPath, installPath); err != nil {
			a.emitEvent("onUpdateError", "Failed to install update: "+err.Error())
			return
		}

		a.emitEvent("onUpdateDone", "restart")

		go func() {
			time.Sleep(500 * time.Millisecond)
			cmd := exec.Command(installPath)
			cmd.Start()
			os.Exit(0)
		}()
	}()

	return map[string]interface{}{"ok": true, "started": true}
}

// installUpdate ставит скачанный временный файл поверх целевого пути
// установки "на месте". Новый файл сначала записывается во временный файл
// рядом с целью (в той же директории), а затем на него делается os.Rename.
//
// Это важно для обновления запущенного AppImage:
//   - прямая запись/обрезка (O_TRUNC) по пути ВЫПОЛНЯЮЩЕГОСЯ файла падает с
//     ETXTBSY ("text file busy") — Linux такое запрещает;
//   - rename поверх выполняющегося файла разрешён: старый inode остаётся
//     открытым для работающего процесса, а путь начинает указывать на новый
//     файл (именно так работает штатный AppImageUpdate);
//   - запись во временный файл в той же директории также решает проблему
//     cross-device, когда скачанный tmpPath лежит на другой файловой системе.
func installUpdate(tmpPath, installPath string) error {
	dir := filepath.Dir(installPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	staged := filepath.Join(dir, ".gitdesktop-update-"+filepath.Base(installPath))
	src, err := os.Open(tmpPath)
	if err != nil {
		return err
	}
	defer src.Close()
	dst, err := os.OpenFile(staged, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}
	if _, err := io.Copy(dst, src); err != nil {
		dst.Close()
		os.Remove(staged)
		return err
	}
	if err := dst.Close(); err != nil {
		os.Remove(staged)
		return err
	}
	if goruntime.GOOS == "windows" {
		oldPath := installPath + ".old"
		os.Remove(oldPath)
		if err := os.Rename(installPath, oldPath); err != nil {
			os.Remove(staged)
			return err
		}
	}
	if err := os.Rename(staged, installPath); err != nil {
		if goruntime.GOOS == "windows" {
			os.Rename(installPath+".old", installPath)
		}
		os.Remove(staged)
		return err
	}
	return nil
}

// ── OAUTH DEVICE FLOW ─────────────────────────────────────────────────────

func (a *App) OAuthLogin() map[string]interface{} {
	if oauthClientID == "" {
		return map[string]interface{}{"ok": false, "error": "OAuth not configured"}
	}

	data := url.Values{}
	data.Set("client_id", oauthClientID)
	data.Set("scope", "repo delete_repo")

	req, err := http.NewRequest("POST", "https://github.com/login/device/code", strings.NewReader(data.Encode()))
	if err != nil {
		return map[string]interface{}{"ok": false, "error": err.Error()}
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "GitDesktop/0.1.0")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return map[string]interface{}{"ok": false, "error": err.Error()}
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var result struct {
		DeviceCode      string `json:"device_code"`
		UserCode        string `json:"user_code"`
		VerificationURI string `json:"verification_uri"`
		ExpiresIn       int    `json:"expires_in"`
		Interval        int    `json:"interval"`
		Error           string `json:"error"`
		ErrorDescription string `json:"error_description"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return map[string]interface{}{"ok": false, "error": fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(body[:min(len(body), 200)]))}
	}
	if result.Error != "" {
		return map[string]interface{}{"ok": false, "error": result.Error + ": " + result.ErrorDescription}
	}

	go a.pollDeviceCode(result.DeviceCode, result.Interval)

	return map[string]interface{}{
		"ok":               true,
		"user_code":        result.UserCode,
		"verification_uri": result.VerificationURI,
	}
}

func (a *App) pollDeviceCode(deviceCode string, interval int) {
	if interval < 5 {
		interval = 5
	}

	for {
		time.Sleep(time.Duration(interval) * time.Second)

		data := url.Values{}
		data.Set("client_id", oauthClientID)
		data.Set("device_code", deviceCode)
		data.Set("grant_type", "urn:ietf:params:oauth:grant-type:device_code")

		req, err := http.NewRequest("POST", "https://github.com/login/oauth/access_token", strings.NewReader(data.Encode()))
		if err != nil {
			a.emitEvent("onOAuthError", err.Error())
			return
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("Accept", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			a.emitEvent("onOAuthError", err.Error())
			return
		}

		var tokenResp struct {
			Error            string `json:"error"`
			ErrorDescription string `json:"error_description"`
			AccessToken      string `json:"access_token"`
		}
		json.NewDecoder(resp.Body).Decode(&tokenResp)
		resp.Body.Close()

		switch tokenResp.Error {
		case "authorization_pending":
			continue
		case "slow_down":
			interval += 5
			continue
		case "expired_token":
			a.emitEvent("onOAuthError", "Code expired. Please try again.")
			return
		case "access_denied":
			a.emitEvent("onOAuthError", "Authorization denied.")
			return
		}

		if tokenResp.AccessToken != "" {
			res := a.Login(tokenResp.AccessToken)
			a.emitEvent("onOAuthSuccess", res)
			return
		}

		a.emitEvent("onOAuthError", "Unexpected response from GitHub")
		return
	}
}

func (a *App) OpenURL(url string) {
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

// ── FILE BROWSER ──────────────────────────────────────────────────────────

func (a *App) GetFileTree() []FileTreeNode {
	if a.localRepo == nil {
		return nil
	}
	tree, err := a.localRepo.FileTree()
	if err != nil {
		return nil
	}
	return tree
}

type FileContentResult struct {
	OK      bool   `json:"ok"`
	Content string `json:"content"`
	Error   string `json:"error,omitempty"`
}

func (a *App) GetFileContent(fpath string) FileContentResult {
	if a.localRepo == nil {
		return FileContentResult{OK: false, Error: "No local repo"}
	}
	content, err := a.localRepo.FileContent(fpath)
	if err != nil {
		return FileContentResult{OK: false, Error: err.Error()}
	}
	return FileContentResult{OK: true, Content: content}
}

func (a *App) WriteFile(fpath, content string) map[string]interface{} {
	if a.localRepo == nil {
		return map[string]interface{}{"ok": false, "error": "No local repo"}
	}
	if err := a.localRepo.WriteFile(fpath, content); err != nil {
		return map[string]interface{}{"ok": false, "error": err.Error()}
	}
	return map[string]interface{}{"ok": true}
}

func (a *App) GetReadme() string {
	if a.localRepo != nil {
		return a.localRepo.ReadmeContent()
	}
	if a.currentUser != "" && a.currentRepo != nil {
		name, _ := a.currentRepo["name"].(string)
		content, err := a.client.GetRepoReadme(a.currentUser, name)
		if err == nil && content != "" {
			return content
		}
	}
	return ""
}

func (a *App) GetRemoteFileTree() []FileTreeNode {
	if a.currentUser == "" || a.currentRepo == nil {
		return nil
	}
	name, _ := a.currentRepo["name"].(string)
	branch, _ := a.currentRepo["default_branch"].(string)
	if branch == "" {
		branch = "main"
	}
	entries, err := a.client.GetRepoTree(a.currentUser, name, branch)
	if err != nil {
		return nil
	}
	return buildTreeFromEntries(entries)
}

func (a *App) GetRemoteFileContent(fpath string) FileContentResult {
	if a.currentUser == "" || a.currentRepo == nil {
		return FileContentResult{OK: false, Error: "No repo selected"}
	}
	name, _ := a.currentRepo["name"].(string)
	branch, _ := a.currentRepo["default_branch"].(string)
	if branch == "" {
		branch = "main"
	}
	content, err := a.client.GetRepoFileContent(a.currentUser, name, fpath, branch)
	if err != nil {
		return FileContentResult{OK: false, Error: err.Error()}
	}
	return FileContentResult{OK: true, Content: content}
}

func (a *App) GetRemoteFileContentBase64(fpath string) FileContentResult {
	if a.currentUser == "" || a.currentRepo == nil {
		return FileContentResult{OK: false, Error: "No repo selected"}
	}
	name, _ := a.currentRepo["name"].(string)
	branch, _ := a.currentRepo["default_branch"].(string)
	if branch == "" {
		branch = "main"
	}
	content, err := a.client.GetRepoFileContentBase64(a.currentUser, name, fpath, branch)
	if err != nil {
		return FileContentResult{OK: false, Error: err.Error()}
	}
	return FileContentResult{OK: true, Content: content}
}

func (a *App) GetRemoteReadme() string {
	if a.currentUser == "" || a.currentRepo == nil {
		return ""
	}
	name, _ := a.currentRepo["name"].(string)
	content, err := a.client.GetRepoReadme(a.currentUser, name)
	if err != nil {
		return ""
	}
	return content
}

func (a *App) GetRemoteHistory() []CommitInfo {
	if a.currentUser == "" || a.currentRepo == nil {
		return nil
	}
	name, _ := a.currentRepo["name"].(string)
	apiCommits, err := a.client.GetRepoCommits(a.currentUser, name)
	if err != nil {
		return nil
	}
	var commits []CommitInfo
	for _, c := range apiCommits {
		sha := c.SHA
		if len(sha) > 7 {
			sha = sha[:7]
		}
		date := c.Date
		if len(date) > 16 {
			date = date[:16]
		}
		commits = append(commits, CommitInfo{
			SHA:       sha,
			Message:   c.Message,
			Author:    c.Author,
			AvatarURL: "https://github.com/" + c.Author + ".png",
			Date:      date,
		})
	}
	return commits
}
func (a *App) GetStashes() []StashInfo {
	if a.localRepo == nil {
		return nil
	}
	s, _ := a.localRepo.GetStashes()
	return s
}

func (a *App) Stash() map[string]interface{} {
	if a.localRepo == nil {
		return map[string]interface{}{"ok": false, "error": "No local repo"}
	}
	err := a.localRepo.Stash()
	if err != nil {
		return map[string]interface{}{"ok": false, "error": err.Error()}
	}
	return map[string]interface{}{"ok": true}
}

func (a *App) StashPop(index string) map[string]interface{} {
	if a.localRepo == nil {
		return map[string]interface{}{"ok": false, "error": "No local repo"}
	}
	err := a.localRepo.StashPop(index)
	if err != nil {
		return map[string]interface{}{"ok": false, "error": err.Error()}
	}
	return map[string]interface{}{"ok": true}
}

func (a *App) StashDrop(index string) map[string]interface{} {
	if a.localRepo == nil {
		return map[string]interface{}{"ok": false, "error": "No local repo"}
	}
	err := a.localRepo.StashDrop(index)
	if err != nil {
		return map[string]interface{}{"ok": false, "error": err.Error()}
	}
	return map[string]interface{}{"ok": true}
}

type ConflictBlockResult struct {
	OK     bool            `json:"ok"`
	Blocks []ConflictBlock `json:"blocks,omitempty"`
	Error  string          `json:"error,omitempty"`
}

func (a *App) GetConflictBlocks(fpath string) ConflictBlockResult {
	if a.localRepo == nil {
		return ConflictBlockResult{OK: false, Error: "No local repo"}
	}
	blocks, err := a.localRepo.GetConflictBlocks(fpath)
	if err != nil {
		return ConflictBlockResult{OK: false, Error: err.Error()}
	}
	return ConflictBlockResult{OK: true, Blocks: blocks}
}

func (a *App) ResolveConflict(fpath string, content string) map[string]interface{} {
	if a.localRepo == nil {
		return map[string]interface{}{"ok": false, "error": "No local repo"}
	}
	err := a.localRepo.ResolveConflict(fpath, content)
	if err != nil {
		return map[string]interface{}{"ok": false, "error": err.Error()}
	}
	return map[string]interface{}{"ok": true}
}

type PullRequest struct {
	Number int    `json:"number"`
	Title  string `json:"title"`
	User   struct {
		Login string `json:"login"`
	} `json:"user"`
	Head struct {
		Ref string `json:"ref"`
	} `json:"head"`
}

func parseOwnerRepo(url string) (string, string) {
	url = strings.TrimSuffix(url, ".git")
	if strings.HasPrefix(url, "http") {
		parts := strings.Split(url, "/")
		if len(parts) >= 2 {
			return parts[len(parts)-2], parts[len(parts)-1]
		}
	} else if strings.Contains(url, ":") {
		parts := strings.Split(url, ":")
		path := parts[len(parts)-1]
		pathParts := strings.Split(path, "/")
		if len(pathParts) == 2 {
			return pathParts[0], pathParts[1]
		}
	}
	return "", ""
}

func (a *App) GetPullRequests() map[string]interface{} {
	if a.localRepo == nil {
		return map[string]interface{}{"ok": false, "error": "No local repo"}
	}
	url, err := a.localRepo.GetRemoteURL("origin")
	if err != nil || url == "" {
		return map[string]interface{}{"ok": false, "error": "No remote origin found"}
	}
	
	owner, repo := parseOwnerRepo(url)
	if owner == "" || repo == "" {
		return map[string]interface{}{"ok": false, "error": "Could not parse GitHub owner/repo from remote URL"}
	}

	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/pulls?state=open", owner, repo)
	
	req, _ := http.NewRequest("GET", apiURL, nil)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if a.config.Token != "" {
		req.Header.Set("Authorization", "token "+a.config.Token)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return map[string]interface{}{"ok": false, "error": err.Error()}
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return map[string]interface{}{"ok": false, "error": fmt.Sprintf("GitHub API error: %s", resp.Status)}
	}

	var prs []PullRequest
	if err := json.NewDecoder(resp.Body).Decode(&prs); err != nil {
		return map[string]interface{}{"ok": false, "error": "Failed to parse PRs"}
	}

	return map[string]interface{}{"ok": true, "prs": prs}
}

func (a *App) CheckoutPullRequest(prNumber int, branchName string) map[string]interface{} {
	if a.localRepo == nil {
		return map[string]interface{}{"ok": false, "error": "No local repo"}
	}
	err := a.localRepo.CheckoutPullRequest(prNumber, branchName)
	if err != nil {
		return map[string]interface{}{"ok": false, "error": err.Error()}
	}
	return map[string]interface{}{"ok": true}
}
