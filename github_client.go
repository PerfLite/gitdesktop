package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type ReleaseAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

type ReleaseInfo struct {
	TagName     string         `json:"tag_name"`
	Name        string         `json:"name"`
	Body        string         `json:"body"`
	HTMLURL     string         `json:"html_url"`
	PublishedAt string         `json:"published_at"`
	Assets      []ReleaseAsset `json:"assets"`
}

type GitHubClient struct {
	token    string
	baseURL  string
	client   *http.Client
}

func NewGitHubClient() *GitHubClient {
	return &GitHubClient{
		baseURL: "https://api.github.com",
		client:  &http.Client{},
	}
}

func (c *GitHubClient) SetToken(token string) {
	c.token = token
}

func (c *GitHubClient) doRequest(method, path string, body interface{}) (*http.Response, error) {
	url := c.baseURL + path
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		return nil, err
	}

	if c.token != "" {
		req.Header.Set("Authorization", "token "+c.token)
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	return c.client.Do(req)
}

func (c *GitHubClient) Authenticate() (bool, string) {
	resp, err := c.doRequest("GET", "/user", nil)
	if err != nil {
		return false, err.Error()
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		var user struct {
			Login string `json:"login"`
		}
		json.NewDecoder(resp.Body).Decode(&user)
		return true, user.Login
	}
	if resp.StatusCode == 401 {
		return false, "Invalid token"
	}
	return false, fmt.Sprintf("Error: %d", resp.StatusCode)
}

func (c *GitHubClient) GetCurrentUser() (map[string]interface{}, error) {
	resp, err := c.doRequest("GET", "/user", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	var user map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&user)
	return user, nil
}

func (c *GitHubClient) GetUserRepos(page, perPage int) ([]map[string]interface{}, error) {
	if perPage == 0 {
		perPage = 30
	}
	if page == 0 {
		page = 1
	}
	url := fmt.Sprintf("/user/repos?page=%d&per_page=%d&sort=updated", page, perPage)
	resp, err := c.doRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	var repos []map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&repos)
	return repos, nil
}

func (c *GitHubClient) CreateRepo(name, description string, private, autoInit bool) (map[string]interface{}, error) {
	data := map[string]interface{}{
		"name":       name,
		"description": description,
		"private":    private,
		"auto_init":  autoInit,
	}

	resp, err := c.doRequest("POST", "/user/repos", data)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 201 {
		var errBody map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&errBody)
		msg, _ := errBody["message"].(string)
		return nil, fmt.Errorf("%s", msg)
	}

	var repo map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&repo)
	return repo, nil
}

func (c *GitHubClient) DeleteRepo(owner, repo string) error {
	resp, err := c.doRequest("DELETE", "/repos/"+owner+"/"+repo, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 204 {
		var errBody map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&errBody)
		msg, _ := errBody["message"].(string)
		return fmt.Errorf("%s", msg)
	}
	return nil
}

func (c *GitHubClient) GetGitIgnoreTemplates() ([]string, error) {
	resp, err := c.doRequest("GET", "/gitignore/templates", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return []string{"None"}, nil
	}

	var templates []string
	json.NewDecoder(resp.Body).Decode(&templates)
	return templates, nil
}

func (c *GitHubClient) GetGitIgnoreTemplate(name string) (string, error) {
	resp, err := c.doRequest("GET", "/gitignore/templates/"+name, nil)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	var tmpl struct {
		Source string `json:"source"`
	}
	json.NewDecoder(resp.Body).Decode(&tmpl)
	return tmpl.Source, nil
}

type GitHubFileNode struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Type string `json:"type"`
	SHA  string `json:"sha"`
	Size int64  `json:"size"`
}

type GitHubTreeEntry struct {
	Path string `json:"path"`
	Mode string `json:"mode"`
	Type string `json:"type"`
	Size int64  `json:"size"`
	SHA  string `json:"sha"`
}

type GitHubTreeResponse struct {
	Truncated bool              `json:"truncated"`
	Tree      []GitHubTreeEntry `json:"tree"`
}

type GitHubCommitItem struct {
	SHA       string `json:"sha"`
	Message   string `json:"commit_message"`
	Author    string `json:"commit_author"`
	Date      string `json:"commit_date"`
}

func (c *GitHubClient) GetRepoTree(owner, repo, branch string) ([]GitHubTreeEntry, error) {
	url := fmt.Sprintf("/repos/%s/%s/git/trees/%s?recursive=1", owner, repo, branch)
	resp, err := c.doRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	var tree GitHubTreeResponse
	json.NewDecoder(resp.Body).Decode(&tree)
	return tree.Tree, nil
}

func (c *GitHubClient) GetRepoReadme(owner, repo string) (string, error) {
	resp, err := c.doRequest("GET", fmt.Sprintf("/repos/%s/%s/readme", owner, repo), nil)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	var file struct {
		Content  string `json:"content"`
		Encoding string `json:"encoding"`
	}
	json.NewDecoder(resp.Body).Decode(&file)
	if file.Encoding == "base64" {
		data, err := base64.StdEncoding.DecodeString(file.Content)
		if err == nil {
			return string(data), nil
		}
	}
	return file.Content, nil
}

func (c *GitHubClient) GetRepoCommits(owner, repo string) ([]GitHubCommitItem, error) {
	resp, err := c.doRequest("GET", fmt.Sprintf("/repos/%s/%s/commits?per_page=50", owner, repo), nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	var rawCommits []struct {
		SHA    string `json:"sha"`
		Commit struct {
			Message string `json:"message"`
			Author  struct {
				Name string `json:"name"`
				Date string `json:"date"`
			} `json:"author"`
		} `json:"commit"`
	}
	json.NewDecoder(resp.Body).Decode(&rawCommits)
	var commits []GitHubCommitItem
	for _, c := range rawCommits {
		commits = append(commits, GitHubCommitItem{
			SHA:      c.SHA,
			Message:  c.Commit.Message,
			Author:   c.Commit.Author.Name,
			Date:     c.Commit.Author.Date,
		})
	}
	return commits, nil
}

func (c *GitHubClient) GetRepoFileContent(owner, repo, path, branch string) (string, error) {
	url := fmt.Sprintf("/repos/%s/%s/contents/%s?ref=%s", owner, repo, path, branch)
	resp, err := c.doRequest("GET", url, nil)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	var file struct {
		Content  string `json:"content"`
		Encoding string `json:"encoding"`
	}
	json.Unmarshal(body, &file)
	if file.Encoding == "base64" {
		data, err := base64.StdEncoding.DecodeString(file.Content)
		if err == nil {
			return string(data), nil
		}
	}
	return file.Content, nil
}

func (c *GitHubClient) GetRepoFileContentBase64(owner, repo, path, branch string) (string, error) {
	url := fmt.Sprintf("/repos/%s/%s/contents/%s?ref=%s", owner, repo, path, branch)
	resp, err := c.doRequest("GET", url, nil)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	var file struct {
		Content  string `json:"content"`
		Encoding string `json:"encoding"`
	}
	json.Unmarshal(body, &file)
	return file.Content, nil
}

func (c *GitHubClient) GetLatestRelease(owner, repo string) (*ReleaseInfo, error) {
	url := fmt.Sprintf("/repos/%s/%s/releases/latest", owner, repo)
	req, err := http.NewRequest("GET", c.baseURL+url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	var release ReleaseInfo
	json.NewDecoder(resp.Body).Decode(&release)
	return &release, nil
}
