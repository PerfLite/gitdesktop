package main

import (
	"crypto/md5"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type GitRepo struct {
	path        string
	authorName  string
	authorEmail string
}

func OpenGitRepo(path string, name, email string) (*GitRepo, error) {
	gitDir := filepath.Join(path, ".git")
	if _, err := os.Stat(gitDir); os.IsNotExist(err) {
		return nil, fmt.Errorf("not a git repository")
	}
	return &GitRepo{path: path, authorName: name, authorEmail: email}, nil
}

func InitGitRepo(path, branch, name, email string) (*GitRepo, error) {
	if err := os.MkdirAll(path, 0755); err != nil {
		return nil, err
	}
	if branch == "" {
		branch = "main"
	}
	cmd := hiddenCmd("git", "init", "-b", branch)
	cmd.Dir = path
	if out, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("%s: %s", err, string(out))
	}
	return &GitRepo{path: path, authorName: name, authorEmail: email}, nil
}

func (r *GitRepo) run(args ...string) (string, error) {
	cmd := hiddenCmd("git", args...)
	cmd.Dir = r.path
	name := r.authorName
	if name == "" {
		name = "GitDesktop"
	}
	email := r.authorEmail
	if email == "" {
		email = "gitdesktop@users.noreply.github.com"
	}
	cmd.Env = append(cmd.Environ(),
		"GIT_AUTHOR_NAME="+name,
		"GIT_AUTHOR_EMAIL="+email,
		"GIT_COMMITTER_NAME="+name,
		"GIT_COMMITTER_EMAIL="+email,
	)
	out, err := cmd.CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

func (r *GitRepo) Status() (string, error) {
	return r.run("status", "--porcelain")
}

func (r *GitRepo) Diff(filepath string) (string, error) {
	diff, err := r.run("diff", "--", filepath)
	if err == nil && diff != "" {
		return diff, nil
	}
	diff2, err2 := r.run("diff", "--cached", "--", filepath)
	if err2 == nil && diff2 != "" {
		return diff2, nil
	}
	content, err3 := r.FileContent(filepath)
	if err3 == nil {
		lines := strings.Split(content, "\n")
		var out strings.Builder
		out.WriteString("diff --git a/" + filepath + " b/" + filepath + "\n")
		out.WriteString("new file mode 100644\n")
		out.WriteString("--- /dev/null\n")
		out.WriteString("+++ b/" + filepath + "\n")
		out.WriteString("@@ -0,0 +1," + fmt.Sprintf("%d", len(lines)) + " @@\n")
		for _, line := range lines {
			out.WriteString("+" + line + "\n")
		}
		return out.String(), nil
	}
	return "", fmt.Errorf("no diff available")
}

func (r *GitRepo) CommitDiff(sha string) (string, error) {
	commit, err := r.run("log", "-1", "--format=%P", sha)
	if err != nil {
		return "", err
	}

	parents := strings.Fields(commit)
	if len(parents) > 0 && parents[0] != "" {
		diff, err := r.run("diff", "--stat", "--no-color", parents[0], sha)
		if err != nil {
			return "", err
		}
		diff += "\n\n"
		fullDiff, err := r.run("diff", "--no-color", "--unified=3", parents[0], sha)
		if err != nil {
			return diff, nil
		}
		diff += fullDiff
		if len(diff) > 50000 {
			diff = diff[:50000]
		}
		return diff, nil
	}

	diff, err := r.run("show", sha, "--no-color", "--unified=3", "--format=%B")
	if err != nil {
		return "", err
	}
	if len(diff) > 50000 {
		diff = diff[:50000]
	}
	return diff, nil
}

func (r *GitRepo) Commit(message, description string) error {
	if _, err := r.run("add", "-A"); err != nil {
		return err
	}
	status, _ := r.run("status", "--porcelain")
	if strings.TrimSpace(status) == "" {
		return fmt.Errorf("nothing to commit")
	}

	fullMsg := message
	if description != "" {
		fullMsg = message + "\n\n" + description
	}
	_, err := r.run("commit", "-m", fullMsg)
	return err
}

func (r *GitRepo) Push(remoteURL, branch string) (string, error) {
	args := []string{"-c", "credential.helper=", "push", "-u", "origin", branch}
	return r.run(args...)
}

func (r *GitRepo) Fetch() error {
	_, err := r.run("fetch")
	return err
}

func (r *GitRepo) Checkout(branch string) error {
	_, err := r.run("checkout", branch)
	return err
}

func (r *GitRepo) BranchInfo() (string, int, int) {
	branch, err := r.run("rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return "unknown", 0, 0
	}

	ahead := 0
	if out, err := r.run("rev-list", "--count", "HEAD@{u}..HEAD"); err == nil {
		fmt.Sscanf(out, "%d", &ahead)
	}

	behind := 0
	if out, err := r.run("rev-list", "--count", "HEAD..HEAD@{u}"); err == nil {
		fmt.Sscanf(out, "%d", &behind)
	}

	return branch, ahead, behind
}

func (r *GitRepo) Branches() ([]string, error) {
	out, err := r.run("branch", "--format=%(refname:short)")
	if err != nil {
		return nil, err
	}
	if out == "" {
		return nil, nil
	}
	return strings.Split(out, "\n"), nil
}

type CommitInfo struct {
	SHA         string   `json:"sha"`
	Message     string   `json:"message"`
	Author      string   `json:"author"`
	AuthorEmail string   `json:"authorEmail"`
	AvatarURL   string   `json:"avatarURL"`
	Date        string   `json:"date"`
	Parents     []string `json:"parents"`
}

func (r *GitRepo) History(maxCount int) ([]CommitInfo, error) {
	if maxCount == 0 {
		maxCount = 50
	}
	out, err := r.run("log", fmt.Sprintf("-%d", maxCount), "--format=%H||%s||%an||%aI||%ae||%P")
	if err != nil {
		return nil, err
	}
	if out == "" {
		return nil, nil
	}

	var commits []CommitInfo
	for _, line := range strings.Split(out, "\n") {
		parts := strings.SplitN(line, "||", 6)
		if len(parts) < 6 {
			continue
		}
		sha := parts[0]
		if len(sha) > 7 {
			sha = sha[:7]
		}
		date, _ := time.Parse(time.RFC3339, parts[3])
		parents := strings.Split(strings.TrimSpace(parts[5]), " ")
		if len(parents) == 1 && parents[0] == "" {
			parents = nil
		} else {
			for i, p := range parents {
				if len(p) > 7 {
					parents[i] = p[:7]
				}
			}
		}
		commits = append(commits, CommitInfo{
			SHA:         sha,
			Message:     parts[1],
			Author:      parts[2],
			AuthorEmail: parts[4],
			AvatarURL:   fmt.Sprintf("https://www.gravatar.com/avatar/%x?d=identicon", md5.Sum([]byte(strings.ToLower(strings.TrimSpace(parts[4]))))),
			Date:        date.Format("02 Jan 2006 15:04"),
			Parents:     parents,
		})
	}
	return commits, nil
}

type ChangeInfo struct {
	Code         string `json:"code"`
	Path         string `json:"path"`
	Display      string `json:"display"`
	IsDir        bool   `json:"is_dir"`
	IsConflicted bool   `json:"is_conflicted"`
}

func (r *GitRepo) Changes() ([]ChangeInfo, error) {
	status, err := r.run("status", "--porcelain")
	if err != nil {
		return nil, err
	}

	var changes []ChangeInfo
	seenDirs := make(map[string]bool)
	for _, line := range strings.Split(status, "\n") {
		line = strings.TrimRight(line, "\r")
		if len(line) < 4 {
			continue
		}
		code := strings.TrimSpace(line[:2])
		fpath := line[3:]
		parts := strings.Split(fpath, "/")
		isDir := len(parts) > 1
		display := parts[0] + "/"
		if !isDir {
			display = fpath
		}

		if isDir && seenDirs[display] {
			continue
		}
		if isDir {
			seenDirs[display] = true
		}
		changes = append(changes, ChangeInfo{
			Code:         code,
			Path:         fpath,
			Display:      display,
			IsDir:        isDir,
			IsConflicted: code == "UU" || code == "AA",
		})
	}
	return changes, nil
}


func (r *GitRepo) SetRemoteURL(remote, url string) error {
	_, err := r.run("remote", "set-url", remote, url)
	return err
}

func (r *GitRepo) AddRemote(remote, url string) error {
	_, err := r.run("remote", "add", remote, url)
	return err
}

func (r *GitRepo) RemoveRemote(remote string) error {
	_, err := r.run("remote", "remove", remote)
	return err
}

func (r *GitRepo) HasUncommittedChanges() bool {
	status, _ := r.run("status", "--porcelain")
	return strings.TrimSpace(status) != ""
}

func Clone(url, dest string) error {
	cmd := hiddenCmd("git", "clone", url, dest)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %s", err, string(out))
	}
	return nil
}

func (r *GitRepo) headValid() bool {
	_, err := r.run("rev-parse", "--verify", "HEAD")
	return err == nil
}

func IsGitRepo(path string) bool {
	_, err := os.Stat(filepath.Join(path, ".git"))
	return err == nil
}

type FileTreeNode struct {
	Name     string         `json:"name"`
	Path     string         `json:"path"`
	IsDir    bool           `json:"is_dir"`
	Children []FileTreeNode `json:"children,omitempty"`
}

func (r *GitRepo) FileTree() ([]FileTreeNode, error) {
	out, err := r.run("ls-tree", "-r", "--name-only", "HEAD")
	if err != nil {
		return nil, err
	}
	if out == "" {
		return nil, nil
	}

	type node struct {
		name     string
		path     string
		isDir    bool
		children []*node
	}

	registry := make(map[string]*node)
	var topNodes []*node

	for _, fpath := range strings.Split(out, "\n") {
		fpath = strings.TrimSpace(fpath)
		if fpath == "" {
			continue
		}
		parts := strings.Split(fpath, "/")

		for i := 0; i < len(parts); i++ {
			p := strings.Join(parts[:i+1], "/")
			if _, exists := registry[p]; exists {
				continue
			}
			n := &node{
				name:  parts[i],
				path:  p,
				isDir: i < len(parts)-1,
			}
			if n.isDir {
				n.children = make([]*node, 0)
			}
			registry[p] = n

			if i == 0 {
				topNodes = append(topNodes, n)
			} else {
				parent := registry[strings.Join(parts[:i], "/")]
				parent.children = append(parent.children, n)
			}
		}
	}

	var convert func(n *node) FileTreeNode
	convert = func(n *node) FileTreeNode {
		result := FileTreeNode{
			Name:  n.name,
			Path:  n.path,
			IsDir: n.isDir,
		}
		if n.isDir && len(n.children) > 0 {
			result.Children = make([]FileTreeNode, len(n.children))
			for i, child := range n.children {
				result.Children[i] = convert(child)
			}
		}
		return result
	}

	result := make([]FileTreeNode, len(topNodes))
	for i, n := range topNodes {
		result[i] = convert(n)
	}
	return result, nil
}

func (r *GitRepo) FileContent(fpath string) (string, error) {
	absPath := filepath.Join(r.path, fpath)
	data, err := os.ReadFile(absPath)
	if err != nil {
		return "", err
	}
	if len(data) > 500000 {
		data = data[:500000]
	}
	return string(data), nil
}

func (r *GitRepo) WriteFile(fpath, content string) error {
	absPath := filepath.Join(r.path, fpath)
	dir := filepath.Dir(absPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	return os.WriteFile(absPath, []byte(content), 0644)
}

func (r *GitRepo) ReadmeContent() string {
	candidates := []string{"README.md", "readme.md", "README.rst", "README.txt", "README", "readme"}
	for _, name := range candidates {
		data, err := os.ReadFile(filepath.Join(r.path, name))
		if err == nil {
			if len(data) > 100000 {
				data = data[:100000]
			}
			return string(data)
		}
	}
	return ""
}

func buildTreeFromEntries(entries []GitHubTreeEntry) []FileTreeNode {
	type node struct {
		name     string
		path     string
		isDir    bool
		children []*node
	}

	registry := make(map[string]*node)
	var topNodes []*node

	dirs := make(map[string]bool)
	for _, e := range entries {
		if e.Type == "tree" {
			dirs[e.Path] = true
		}
	}

	for _, e := range entries {
		parts := strings.Split(e.Path, "/")
		for i := 0; i < len(parts); i++ {
			p := strings.Join(parts[:i+1], "/")
			if _, exists := registry[p]; exists {
				continue
			}
			n := &node{
				name:  parts[i],
				path:  p,
				isDir: dirs[p],
			}
			if n.isDir {
				n.children = make([]*node, 0)
			}
			registry[p] = n
			if i == 0 {
				topNodes = append(topNodes, n)
			} else {
				parent := registry[strings.Join(parts[:i], "/")]
				parent.children = append(parent.children, n)
			}
		}
	}

	var convert func(n *node) FileTreeNode
	convert = func(n *node) FileTreeNode {
		result := FileTreeNode{
			Name:  n.name,
			Path:  n.path,
			IsDir: n.isDir,
		}
		if n.isDir && len(n.children) > 0 {
			result.Children = make([]FileTreeNode, len(n.children))
			for i, child := range n.children {
				result.Children[i] = convert(child)
			}
		}
		return result
	}

	result := make([]FileTreeNode, len(topNodes))
	for i, n := range topNodes {
		result[i] = convert(n)
	}
	return result
}
type StashInfo struct {
	Index   string `json:"index"`
	Message string `json:"message"`
	Date    string `json:"date"`
}

func (r *GitRepo) GetStashes() ([]StashInfo, error) {
	out, err := r.run("stash", "list", "--format=%gd||%gs||%aI")
	if err != nil {
		return nil, err
	}
	if out == "" {
		return []StashInfo{}, nil
	}
	var stashes []StashInfo
	for _, line := range strings.Split(out, "\n") {
		parts := strings.SplitN(line, "||", 3)
		if len(parts) == 3 {
			date, _ := time.Parse(time.RFC3339, parts[2])
			stashes = append(stashes, StashInfo{
				Index:   parts[0],
				Message: parts[1],
				Date:    date.Format("02 Jan 2006 15:04"),
			})
		}
	}
	return stashes, nil
}

func (r *GitRepo) Stash() error {
	_, err := r.run("stash", "push", "-u", "-m", "Stashed by GitDesktop")
	return err
}

func (r *GitRepo) StashPop(index string) error {
	_, err := r.run("stash", "pop", index)
	return err
}

func (r *GitRepo) StashDrop(index string) error {
	_, err := r.run("stash", "drop", index)
	return err
}

type ConflictBlock struct {
	Type     string `json:"type"` // "normal" or "conflict"
	Content  string `json:"content,omitempty"`
	Current  string `json:"current,omitempty"`
	Incoming string `json:"incoming,omitempty"`
}

func (r *GitRepo) GetConflictBlocks(fpath string) ([]ConflictBlock, error) {
	content, err := r.FileContent(fpath)
	if err != nil {
		return nil, err
	}
	var blocks []ConflictBlock
	lines := strings.Split(content, "\n")
	
	var currentNormal []string
	var currentConflictCurrent []string
	var currentConflictIncoming []string
	
	inConflict := false
	inIncoming := false
	
	for _, line := range lines {
		if strings.HasPrefix(line, "<<<<<<<") {
			if len(currentNormal) > 0 {
				blocks = append(blocks, ConflictBlock{Type: "normal", Content: strings.Join(currentNormal, "\n")})
				currentNormal = nil
			}
			inConflict = true
			inIncoming = false
			continue
		}
		if strings.HasPrefix(line, "=======") && inConflict {
			inIncoming = true
			continue
		}
		if strings.HasPrefix(line, ">>>>>>>") && inConflict {
			blocks = append(blocks, ConflictBlock{
				Type:     "conflict", 
				Current:  strings.Join(currentConflictCurrent, "\n"),
				Incoming: strings.Join(currentConflictIncoming, "\n"),
			})
			currentConflictCurrent = nil
			currentConflictIncoming = nil
			inConflict = false
			continue
		}
		
		if inConflict {
			if inIncoming {
				currentConflictIncoming = append(currentConflictIncoming, line)
			} else {
				currentConflictCurrent = append(currentConflictCurrent, line)
			}
		} else {
			currentNormal = append(currentNormal, line)
		}
	}
	
	if len(currentNormal) > 0 {
		blocks = append(blocks, ConflictBlock{Type: "normal", Content: strings.Join(currentNormal, "\n")})
	}
	
	return blocks, nil
}

func (r *GitRepo) ResolveConflict(fpath string, resolvedContent string) error {
	if err := r.WriteFile(fpath, resolvedContent); err != nil {
		return err
	}
	_, err := r.run("add", fpath)
	return err
}

func (r *GitRepo) GetRemoteURL(remote string) (string, error) {
	out, err := r.run("remote", "get-url", remote)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

func (r *GitRepo) CheckoutPullRequest(prNumber int, branchName string) error {
	// git fetch origin pull/ID/head:BRANCHNAME
	if _, err := r.run("fetch", "origin", fmt.Sprintf("pull/%d/head:%s", prNumber, branchName)); err != nil {
		return err
	}
	// git checkout BRANCHNAME
	return r.Checkout(branchName)
}
