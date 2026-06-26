package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type GitRepo struct {
	path string
}

func OpenGitRepo(path string) (*GitRepo, error) {
	gitDir := filepath.Join(path, ".git")
	if _, err := os.Stat(gitDir); os.IsNotExist(err) {
		return nil, fmt.Errorf("not a git repository")
	}
	return &GitRepo{path: path}, nil
}

func InitGitRepo(path, branch string) (*GitRepo, error) {
	if err := os.MkdirAll(path, 0755); err != nil {
		return nil, err
	}
	if branch == "" {
		branch = "main"
	}
	cmd := exec.Command("git", "init", "-b", branch)
	cmd.Dir = path
	if out, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("%s: %s", err, string(out))
	}
	return &GitRepo{path: path}, nil
}

func (r *GitRepo) run(args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = r.path
	out, err := cmd.CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

func (r *GitRepo) Status() (string, error) {
	return r.run("status", "--porcelain")
}

func (r *GitRepo) Diff(filepath string) (string, error) {
	diff, err := r.run("diff", filepath)
	if err != nil {
		return "", err
	}
	if diff == "" {
		diff, err = r.run("diff", "--cached", filepath)
		if err != nil {
			return "", err
		}
	}
	if diff == "" {
		return "(new file)", nil
	}
	return diff, nil
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

func (r *GitRepo) Push(remoteURL, branch string) error {
	args := []string{"push"}
	if remoteURL != "" {
		args = append(args, remoteURL)
	}
	args = append(args, branch)
	_, err := r.run(args...)
	return err
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
	SHA      string `json:"sha"`
	Message  string `json:"message"`
	Author   string `json:"author"`
	Date     string `json:"date"`
}

func (r *GitRepo) History(maxCount int) ([]CommitInfo, error) {
	if maxCount == 0 {
		maxCount = 50
	}
	out, err := r.run("log", fmt.Sprintf("-%d", maxCount), "--format=%H||%s||%an||%aI")
	if err != nil {
		return nil, err
	}
	if out == "" {
		return nil, nil
	}

	var commits []CommitInfo
	for _, line := range strings.Split(out, "\n") {
		parts := strings.SplitN(line, "||", 4)
		if len(parts) < 4 {
			continue
		}
		sha := parts[0]
		if len(sha) > 7 {
			sha = sha[:7]
		}
		date, _ := time.Parse(time.RFC3339, parts[3])
		commits = append(commits, CommitInfo{
			SHA:     sha,
			Message: parts[1],
			Author:  parts[2],
			Date:    date.Format("2006-01-02 15:04"),
		})
	}
	return commits, nil
}

type ChangeInfo struct {
	Code    string `json:"code"`
	Path    string `json:"path"`
	Display string `json:"display"`
	IsDir   bool   `json:"is_dir"`
}

func (r *GitRepo) Changes() ([]ChangeInfo, error) {
	status, err := r.run("status", "--porcelain")
	if err != nil {
		return nil, err
	}

	var changes []ChangeInfo
	seenDirs := make(map[string]bool)
	for _, line := range strings.Split(status, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
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
			Code:    code,
			Path:    fpath,
			Display: display,
			IsDir:   isDir,
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
	cmd := exec.Command("git", "clone", url, dest)
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
