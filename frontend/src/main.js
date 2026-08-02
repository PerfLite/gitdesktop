import { GetSavedToken, Login, Logout, GetCachedRepos, GetRepos, OpenLocalRepo, GetSavedRepoPath, CloneRepo, GetLastClonePath, GetChanges, GetDiff, Commit, Push, Fetch, GetBranchInfo, GetBranches, CheckoutBranch, GetCommitDiff, GetHistory, OpenInBrowser, OpenInFiles, GetLocalPath, GetConfig, CreateRepo, DeleteRepo, GetGitIgnoreTemplates, StartWatcher, StopWatcher, GetVersion, CheckForUpdates, DownloadUpdate, OAuthLogin, OpenURL, GetFileTree, GetFileContent, GetReadme, SetCurrentRepo, GetRemoteFileTree, GetRemoteFileContent, GetRemoteFileContentBase64, GetRemoteReadme, GetRemoteHistory, WriteFile, GetStashes, Stash, StashPop, StashDrop, GetConflictBlocks, ResolveConflict, GetPullRequests, CheckoutPullRequest } from '../wailsjs/go/main/App';
import { EventsOn } from '../wailsjs/runtime/runtime';
import githubLogo from './assets/GitHub-logo.gif';
import githubIcon from './assets/github-64.png';

const state = {
  user: null,
  avatarUrl: null,
  repos: [],
  currentRepo: null,
  activeTab: 'changes',
  activeFile: null,
  fontSize: 14,
  editingFile: null,
  editingOriginal: null,
};

function $(sel, ctx = document) { return ctx.querySelector(sel); }
function $$(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  const screen = $(`#screen-${id}`);
  if (screen) {
    screen.classList.add('active');
    screen.style.animation = 'none';
    screen.offsetHeight;
    screen.style.animation = '';
  }
}

function toast(msg, type = 'success') {
  const icons = {
    success: `<svg viewBox="0 0 16 16"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>`,
    error:   `<svg viewBox="0 0 16 16"><path d="M4.47.22A.75.75 0 0 1 5 0h6a.75.75 0 0 1 .53.22l4.25 4.25c.141.14.22.331.22.53v6a.75.75 0 0 1-.22.53l-4.25 4.25A.75.75 0 0 1 11 16H5a.75.75 0 0 1-.53-.22L.22 11.53A.75.75 0 0 1 0 11V5a.75.75 0 0 1 .22-.53L4.47.22zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5H5.31zM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>`,
  };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icons[type]}<span>${msg}</span>`;
  $('#toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function openModal(html) {
  const overlay = $('#modal-overlay');
  overlay.innerHTML = `<div class="modal">
    <button class="modal-close-btn" id="modal-close-x">&times;</button>
    ${html}
  </div>`;
  overlay.classList.remove('hidden');
  $('#modal-close-x').onclick = closeModal;
}

function closeModal() {
  $('#modal-overlay').classList.add('hidden');
  $('#modal-overlay').innerHTML = '';
}

const icons = {
  hub:    `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`,
  book:   `<svg viewBox="0 0 16 16"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8V1.5Z"/></svg>`,
  lock:   `<svg viewBox="0 0 16 16"><path d="M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4Zm8.25 3.5h-8.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25ZM10.5 6V4a2.5 2.5 0 0 0-5 0v2Z"/></svg>`,
  branch: `<svg viewBox="0 0 16 16"><path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/></svg>`,
  check:  `<svg viewBox="0 0 16 16"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>`,
  folder: `<svg viewBox="0 0 16 16"><path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/></svg>`,
  edit:   `<svg viewBox="0 0 16 16"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086ZM11.189 6.25 9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.25.25 0 0 0 .108-.064l6.286-6.286Z"/></svg>`,
  plus:   `<svg viewBox="0 0 16 16"><path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/></svg>`,
  minus:  `<svg viewBox="0 0 16 16"><path d="M2 7.75A.75.75 0 0 1 2.75 7h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 7.75Z"/></svg>`,
  warn:   `<svg viewBox="0 0 16 16"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>`,
  back:   `<svg viewBox="0 0 16 16"><path d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z"/></svg>`,
  cloud:  `<svg viewBox="0 0 16 16"><path d="M4.5 9.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5Zm2-3a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1H7a.5.5 0 0 1-.5-.5ZM8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM2.5 8a5.5 5.5 0 1 1 11 0 5.5 5.5 0 0 1-11 0Z"/></svg>`,
  globe:  `<svg viewBox="0 0 16 16"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM5.78 8.75a9.64 9.64 0 0 0 1.363 4.177c.255.426.542.832.857 1.215.245-.296.551-.705.857-1.215A9.64 9.64 0 0 0 10.22 8.75Zm4.44-1.5a9.64 9.64 0 0 0-1.363-4.177c-.307-.51-.612-.919-.857-1.215a9.927 9.927 0 0 0-.857 1.215A9.64 9.64 0 0 0 5.78 7.25Zm-5.944 1.5H1.543a6.507 6.507 0 0 0 4.666 5.5 11.13 11.13 0 0 1-1.832-5.5Zm-2.733-1.5h2.733a11.13 11.13 0 0 1 1.832-5.5 6.507 6.507 0 0 0-4.565 5.5Zm10.181 1.5a11.13 11.13 0 0 1-1.832 5.5 6.507 6.507 0 0 0 4.565-5.5Zm1.832-1.5a6.507 6.507 0 0 0-4.666-5.5 11.13 11.13 0 0 1 1.832 5.5Z"/></svg>`,
  trash:  `<svg viewBox="0 0 16 16"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/></svg>`,
  copy:   `<svg viewBox="0 0 16 16"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>`,
  refresh:`<svg viewBox="0 0 16 16"><path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z"/></svg>`,
  logout: `<svg viewBox="0 0 16 16"><path d="M2 2.75C2 1.784 2.784 1 3.75 1h2.5a.75.75 0 0 1 0 1.5h-2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h2.5a.75.75 0 0 1 0 1.5h-2.5A1.75 1.75 0 0 1 2 13.25Zm10.44 4.5-1.97-1.97a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l1.97-1.97H6.75a.75.75 0 0 1 0-1.5Z"/></svg>`,
  download:`<svg viewBox="0 0 16 16"><path d="M8 12a.75.75 0 0 1-.53-.22l-4.25-4.25a.75.75 0 0 1 1.06-1.06L8 10.19l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25A.75.75 0 0 1 8 12z"/><path d="M8 1.75a.75.75 0 0 1 .75.75v8.5a.75.75 0 0 1-1.5 0v-8.5A.75.75 0 0 1 8 1.75zM1.75 13.5a.75.75 0 0 1 .75-.75h11a.75.75 0 0 1 0 1.5h-11a.75.75 0 0 1-.75-.75z"/></svg>`,
  info:    `<svg viewBox="0 0 16 16"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0 1 14.25 16H1.75A1.75 1.75 0 0 1 0 14.25ZM1.75 1.5a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>`,
  telegram:`<svg viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.515-3.106a.5.5 0 0 0-.384-.155l-4.047 1.35-1.497-1.238a.3.3 0 0 0-.39.14l-.668 1.435-.668-1.435a.3.3 0 0 0-.39-.14l-1.497 1.238-4.047-1.355a.5.5 0 0 0-.572.25L1.86 7.14a.5.5 0 0 0 .057.548l2.636 2.15-2.636 2.15a.5.5 0 0 0-.057.548l1.068 2.37a.5.5 0 0 0 .648.257l4.11-1.695 1.497 1.238a.3.3 0 0 0 .39-.14l.668-1.435.668 1.435a.3.3 0 0 0 .39.14l1.497-1.238 4.11 1.695a.5.5 0 0 0 .648-.257l1.068-2.37a.5.5 0 0 0-.057-.548l-2.636-2.15 2.636-2.15a.5.5 0 0 0 .057-.548L13.056 2.15a.5.5 0 0 0-.571-.256zM7.38 10.36l-1.32 4.88a.15.15 0 0 0 .23.16l1.31-.59 1.31.59a.15.15 0 0 0 .23-.16l-1.32-4.88h.74l1.53-5.36a.15.15 0 0 0-.23-.16L9.32 9.21l-1.31-.59a.15.15 0 0 0-.23.16l-1.53 5.36h.74z"/></svg>`,
  settings:`<svg viewBox="0 0 16 16"><path d="M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.038.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 0 1-.704 1.217c-.428.61-1.176.807-1.82.63l-1.102-.302c-.067-.019-.177-.011-.3.071a5.909 5.909 0 0 1-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 0 1-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.12 8.12 0 0 1-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 0 1 0-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 0 1 .704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C6.009.645 6.556.095 7.299.03 7.53.01 7.764 0 8 0Zm-.571 1.525c-.036.003-.108.036-.137.146l-.289 1.105c-.147.561-.549.967-.998 1.189-.173.086-.34.183-.5.29-.417.278-.97.423-1.529.27l-1.103-.303c-.109-.03-.175.016-.195.045-.22.312-.412.644-.573.99-.014.031-.021.11.059.19l.815.806c.411.406.562.957.53 1.456a4.709 4.709 0 0 0 0 .582c.032.499-.119 1.05-.53 1.456l-.815.806c-.081.08-.073-.159-.059.19.162.346.353.677.573.989.02.03.085.076.195.046l1.102-.303c.56-.153 1.113-.008 1.53.27.161.107.328.204.501.29.447.222.85.629.997 1.189l.289 1.105c.029.109.101.143.137.146a6.6 6.6 0 0 0 1.142 0c.036-.003.108-.036.137-.146l.289-1.105c.147-.561.549-.967.998-1.189.173-.086.34-.183.5-.29.417-.278.97-.423 1.529-.27l1.103.303c.109.029.175-.016.195-.045.22-.313.411-.644.573-.99.014-.031.021-.11-.059-.19l-.815-.806c-.411-.406-.562-.957-.53-1.456a4.709 4.709 0 0 0 0-.582c-.032-.499.119-1.05.53-1.456l.815-.806c.081-.08.073-.159.059-.19a6.464 6.464 0 0 0-.573-.989c-.02-.03-.085-.076-.195-.046l-1.102.303c-.56.153-1.113.008-1.53-.27a4.44 4.44 0 0 0-.501-.29c-.447-.222-.85-.629-.997-1.189l-.289-1.105c-.029-.11-.101-.143-.137-.146a6.6 6.6 0 0 0-1.142 0ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9.5 8a1.5 1.5 0 1 0-3.001.001A1.5 1.5 0 0 0 9.5 8Z"/></svg>`,
  chevron_down:`<svg viewBox="0 0 16 16"><path d="M4.427 7.427l3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427z"/></svg>`,
};

function icon(name) { return icons[name] || ''; }

const langColors = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5',
  Java: '#b07219', Kotlin: '#A97BFF', 'C++': '#f34b7d', C: '#555555',
  'C#': '#178600', Go: '#00ADD8', Rust: '#dea584', Ruby: '#701516',
  PHP: '#4F5D95', Swift: '#F05138', Dart: '#00B4AB', HTML: '#e34c26',
  CSS: '#563d7c', Shell: '#89e051', Lua: '#000080', Vue: '#41b883',
  Scala: '#c22d40', Haskell: '#5e5086', R: '#198CE7', GLSL: '#5686a5',
};

const langIcons = {
  JavaScript: 'devicon-javascript-plain', TypeScript: 'devicon-typescript-plain',
  Python: 'devicon-python-plain', Java: 'devicon-java-plain',
  Kotlin: 'devicon-kotlin-plain', 'C++': 'devicon-cplusplus-plain',
  C: 'devicon-c-plain', 'C#': 'devicon-csharp-plain', Go: 'devicon-go-plain',
  Rust: 'devicon-rust-plain', Ruby: 'devicon-ruby-plain', PHP: 'devicon-php-plain',
  Swift: 'devicon-swift-plain', Dart: 'devicon-dart-plain', HTML: 'devicon-html5-plain',
  CSS: 'devicon-css3-plain', Shell: 'devicon-bash-plain', Lua: 'devicon-lua-plain',
  Vue: 'devicon-vuejs-plain', Scala: 'devicon-scala-plain',
  Haskell: 'devicon-haskell-plain', R: 'devicon-r-plain',
};

function langBadge(lang) {
  if (!lang) return '';
  const color = langColors[lang] || '#8b949e';
  const cls = langIcons[lang];
  if (cls) {
    return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--muted)">
      <i class="${cls}" style="font-size:13px;color:${color};flex-shrink:0"></i>${lang}
    </span>`;
  }
  return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--muted)">
    <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0"></span>${lang}
  </span>`;
}

function relativeDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff/86400)}d ago`;
  if (diff < 31536000) return `${Math.floor(diff/2592000)}mo ago`;
  return `${Math.floor(diff/31536000)}y ago`;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderLogin() {
  $('#screen-login').innerHTML = `
    <div class="login-card">
      <img class="hub-icon" src="${githubLogo}" alt="GitDesktop" style="width:48px;height:48px">
      <h1>GitDesktop</h1>

      <button class="btn primary" id="oauth-btn" style="width:100%;justify-content:center;padding:10px 16px;margin-top:10px">
        ${icon('globe')} Sign in with GitHub
      </button>

      <div style="width:100%;text-align:center;color:var(--muted);font-size:11px;margin:12px 0 8px;position:relative">
        <span style="background:var(--sidebar);padding:0 8px;position:relative;z-index:1">or use a token</span>
        <div style="position:absolute;left:0;right:0;top:50%;height:1px;background:var(--border)"></div>
      </div>

      <div style="width:100%">
        <input id="token-input" class="input" type="password" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" autocomplete="off">
        <div style="margin-top:8px;font-size:11px;color:var(--muted);line-height:1.6">
          <div style="margin-bottom:2px">Required token scopes:</div>
          <div style="display:flex;align-items:center;gap:4px"><span style="color:var(--green)">&#x2713;</span> <code style="background:var(--bg);padding:1px 5px;border-radius:3px;font-size:10px">repo</code> Full control of repositories</div>
          <div style="display:flex;align-items:center;gap:4px"><span style="color:var(--green)">&#x2713;</span> <code style="background:var(--bg);padding:1px 5px;border-radius:3px;font-size:10px">delete_repo</code> Delete repositories</div>
        </div>
        <div id="login-error" class="error-text"></div>
      </div>

      <div class="login-actions">
        <button class="btn" id="get-token-btn">Get token</button>
        <button class="btn" id="login-btn">Sign in with token</button>
      </div>
    </div>`;
  $('#oauth-btn').onclick = doOAuthLogin;
  $('#get-token-btn').onclick = () => OpenInBrowser('https://github.com/settings/tokens');
  $('#login-btn').onclick = doLogin;
  $('#token-input').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}

async function doOAuthLogin() {
  const btn = $('#oauth-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = 'Connecting...'; }
  try {
    const res = await OAuthLogin();
    if (res.ok) {
      showDeviceCodeScreen(res.user_code, res.verification_uri);
    } else {
      const errEl = $('#login-error');
      if (errEl) errEl.textContent = res.error;
      if (btn) { btn.disabled = false; btn.innerHTML = `${icon('globe')} Sign in with GitHub`; }
    }
  } catch(e) {
    const errEl = $('#login-error');
    if (errEl) errEl.textContent = String(e);
    if (btn) { btn.disabled = false; btn.innerHTML = `${icon('globe')} Sign in with GitHub`; }
  }
}

function showDeviceCodeScreen(code, uri) {
  $('#screen-login').innerHTML = `
    <div class="login-card">
      <img class="hub-icon" src="${githubLogo}" alt="GitDesktop" style="width:48px;height:48px">
      <h2 style="font-size:16px;margin-bottom:4px">Authorize GitDesktop</h2>
      <p style="color:var(--muted);font-size:12px;margin-bottom:16px">Enter this code on GitHub:</p>
      <div id="device-code-box" style="background:var(--bg);border:2px solid var(--border);border-radius:8px;padding:16px 24px;font-size:28px;font-weight:700;letter-spacing:4px;color:var(--accent);font-family:monospace;text-align:center;margin-bottom:12px;cursor:pointer" title="Click to copy">${code}</div>
      <button class="btn" id="copy-code-btn" style="width:100%;justify-content:center;padding:6px 16px;margin-bottom:12px;font-size:12px">${icon('copy')} Copy code</button>
      <button class="btn primary" id="open-github-btn" style="width:100%;justify-content:center;padding:10px 16px">
        Open ${uri}
      </button>
      <div style="margin-top:16px;display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px">
        <div style="width:14px;height:14px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite"></div>
        Waiting for authorization...
      </div>
      <div id="login-error" class="error-text" style="margin-top:8px"></div>
    </div>`;
  const copyCode = () => {
    navigator.clipboard.writeText(code).then(() => {
      const btn = $('#copy-code-btn');
      if (btn) { btn.innerHTML = `${icon('check')} Copied!`; setTimeout(() => { btn.innerHTML = `${icon('copy')} Copy code`; }, 1500); }
    });
  };
  $('#copy-code-btn').onclick = copyCode;
  $('#device-code-box').onclick = copyCode;
  $('#open-github-btn').onclick = () => OpenURL(uri);
}

async function doLogin() {
  const token = $('#token-input')?.value?.trim();
  if (!token) { $('#login-error').textContent = 'Please enter a token'; return; }
  $('#login-btn').disabled = true;
  $('#login-btn').textContent = 'Signing in...';
  try {
    const res = await Login(token);
    if (res.ok) {
      state.user = res.user;
      state.avatarUrl = res.avatar_url || '';
      renderMain();
    } else {
      $('#login-error').textContent = res.error;
      $('#login-btn').disabled = false;
      $('#login-btn').innerHTML = 'Sign in';
    }
  } catch(e) {
    $('#login-error').textContent = String(e);
    $('#login-btn').disabled = false;
    $('#login-btn').innerHTML = 'Sign in';
  }
}

async function renderMain() {
  showScreen('main');
  const s = $('#screen-main');
  s.innerHTML = `
    <div class="app-header">
      <div class="brand" id="brand-link">
        <img class="hub" src="${githubLogo}" alt="GitHub">
        <span>GitHub</span>
        <button class="icon-btn" id="update-btn" title="Check for updates" style="display:none;margin-left:4px">${icon('download')}</button>
      </div>
      <div class="actions">
        <span style="color:var(--accent);font-weight:600;font-size:12px;margin-right:6px">@${state.user}</span>
        <button class="icon-btn" id="settings-btn" title="Settings">${icon('settings')}</button>
        <button class="icon-btn" id="about-btn" title="About">${icon('info')}</button>
        <button class="icon-btn" id="refresh-btn" title="Refresh">${icon('refresh')}</button>
        <button class="icon-btn" id="logout-btn" title="Sign out">${icon('logout')}</button>
      </div>
    </div>
    <div class="app-body">
      <div class="sidebar">
        <div class="sidebar-search">
          <input class="input" id="repo-search" placeholder="Filter repositories">
        </div>
        <div class="repo-list" id="repo-list"></div>
        <div class="sidebar-status" id="sidebar-status">Loading...</div>
      </div>
      <div id="main-right" class="main-welcome">
        <img src="${githubLogo}" alt="GitHub" style="width:120px;height:120px;margin-bottom:16px;opacity:0.85">
        <h2>Select a repository</h2>
        <p>Choose from the list on the left</p>
        <div class="welcome-actions">
          <button class="btn" id="clone-btn">${icon('download')} Clone repository</button>
          <button class="btn primary" id="new-repo-btn">${icon('plus')} New repository</button>
        </div>
      </div>
    </div>`;

  $('#brand-link').onclick = () => OpenInBrowser('https://github.com');
  $('#settings-btn').onclick = showSettings;
  $('#about-btn').onclick = showAbout;
  $('#refresh-btn').onclick = loadRepos;
  $('#logout-btn').onclick = doLogout;
  $('#repo-search').oninput = filterRepos;
  $('#clone-btn').onclick = () => showCloneDialog();
  $('#new-repo-btn').onclick = showCreateDialog;
  $('#update-btn').onclick = (e) => { e.stopPropagation(); showUpdateModal(); };

  const cached = await GetCachedRepos();
  if (cached && cached.length) renderRepoList(cached, true);
  loadRepos();
  checkForUpdates();
}

async function loadRepos() {
  try {
    const res = await GetRepos();
    if (res.ok) {
      state.repos = res.repos;
      renderRepoList(res.repos, false);
    } else {
      const el = $('#sidebar-status');
      if (el) el.textContent = `Error: ${res.error}`;
    }
  } catch(e) {
    const el = $('#sidebar-status');
    if (el) el.textContent = `Error: ${e}`;
  }
}

let pendingUpdate = null;

async function checkForUpdates() {
  try {
    const info = await CheckForUpdates();
    if (info.update_available) {
      pendingUpdate = info;
      const btn = $('#update-btn');
      if (btn) { btn.style.display = ''; btn.classList.add('update-available'); }
    }
  } catch(e) {
    console.error('Update check failed:', e);
  }
}

function showUpdateModal() {
  if (!pendingUpdate) return;
  const info = pendingUpdate;
  const notes = (info.release_notes || 'No release notes').replace(/\n/g, '<br>');
  openModal(`
    <div class="modal-header">Update available</div>
    <div class="modal-body" style="text-align:center;padding:20px">
      <img src="${githubLogo}" alt="GitDesktop" style="width:48px;height:48px;margin-bottom:10px;opacity:0.9">
      <h2 style="margin-bottom:4px">v${info.latest_version}</h2>
      <p style="color:var(--muted);font-size:12px;margin-bottom:14px">Current version: v${info.current_version}</p>
      <div style="text-align:left;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;font-size:12px;color:var(--muted);max-height:180px;overflow-y:auto;line-height:1.7">${notes}</div>
    </div>
    <div class="modal-footer">
      <button class="btn" id="update-cancel-btn">Cancel</button>
      <button class="btn primary" id="update-install-btn">Install update</button>
    </div>`);
  $('#update-cancel-btn').onclick = closeModal;
  $('#update-install-btn').onclick = () => { closeModal(); doInstallUpdate(); };
}

async function doInstallUpdate() {
  const btn = $('#update-install-btn');
  const progress = $('#update-progress');
  if (btn) { btn.disabled = true; btn.textContent = 'Installing...'; }
  if (progress) { progress.style.display = 'block'; progress.textContent = 'Starting download...'; }
  try {
    await DownloadUpdate();
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Install'; }
    if (progress) progress.textContent = 'Error: ' + e;
    toast('Update failed: ' + e, 'error');
  }
}

function renderRepoList(repos, cached) {
  state.repos = repos;
  const list = $('#repo-list');
  if (!list) return;
  const q = ($('#repo-search') || {}).value || '';
  const filtered = repos.filter(r => (r.name || '').toLowerCase().includes(q.toLowerCase()));
  list.innerHTML = filtered.map((r, i) => `
    <div class="repo-item" data-idx="${i}" data-name="${r.name}">
      <span class="repo-icon" style="${r.private ? 'color:#d29922;filter:drop-shadow(0 0 4px #d2992266)' : 'color:var(--muted)'}">${r.private ? icon('lock') : icon('book')}</span>
      <div class="repo-info">
        <div class="repo-name">${r.name}</div>
        <div class="repo-desc" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${langBadge(r.language)}
          ${r.stargazers_count ? `<span style="color:var(--muted);font-size:11px">${r.stargazers_count}</span>` : ''}
          ${r.updated_at ? `<span style="color:var(--muted);font-size:11px">${relativeDate(r.updated_at)}</span>` : ''}
        </div>
      </div>
    </div>`).join('');

  list.querySelectorAll('.repo-item').forEach(el => {
    el.onclick = () => openRepo(parseInt(el.dataset.idx));
  });

  const status = $('#sidebar-status');
  if (status) status.textContent = `${filtered.length} repositories${cached ? ' (cached)' : ''}`;
}

function filterRepos() {
  renderRepoList(state.repos, false);
}

async function doLogout() {
  await Logout();
  state.user = null;
  state.repos = [];
  showScreen('login');
  renderLogin();
}

async function showAbout() {
  const ver = await GetVersion();
  openModal(`
    <div class="modal-header">About GitDesktop</div>
    <div class="modal-body" style="text-align:center;padding:24px">
      <img src="${githubLogo}" alt="GitHub" style="width:80px;height:80px;margin-bottom:12px;opacity:0.9">
      <h2 style="margin-bottom:4px">GitDesktop</h2>
      <p style="color:var(--muted);font-size:12px;margin-bottom:20px">v${ver} &mdash; Git repository manager for Linux</p>

      <div style="text-align:left;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:16px">
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Developer</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <a id="about-github" style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 8px;border-radius:4px;text-decoration:none;color:var(--text)" onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background=''">
            <svg viewBox="0 0 16 16" style="width:16px;height:16px;fill:var(--text);flex-shrink:0"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
            <span>GitHub: <strong style="color:var(--accent)">PerfLite</strong></span>
          </a>
          <a id="about-telegram" style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 8px;border-radius:4px;text-decoration:none;color:var(--text)" onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background=''">
            <svg viewBox="0 0 50 50" style="width:16px;height:16px;flex-shrink:0"><circle cx="25" cy="25" r="24" fill="#29A9E1"/><path d="M10.5 24.6c7.3-3.2 12.2-5.3 14.7-6.3 7-2.9 8.4-3.4 9.4-3.4.2 0 .6.1.9.3.2.2.3.4.3.6 0 .2-.1.6-.1.6-.6 5.7-3.3 14.1-4.8 18.7-.3 1.1-.9 1.5-1.4 1.5-.6 0-1.1-.4-1.7-1-2.4-2.3-4.6-4.1-7.4-6.4-.4-.4-.2-.7.1-.8.2-.2 4.3-3.9 8.5-7.7.2-.2.3-.3 0-.1-1.3.9-7.2 5.2-8.5 5.8-.5.3-1.1.3-1.8.1-1-.3-3.4-1.1-5.4-1.8-.7-.3-1.1-.5-1-.8.1-.2.1-.3.7-.4z" fill="#fff"/></svg>
            <span>Telegram: <strong style="color:var(--accent)">PerfLite</strong></span>
          </a>
        </div>
      </div>

      <div style="text-align:left;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:16px">
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Built with</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          <span style="background:var(--sidebar);border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:12px;color:var(--accent)">Go</span>
          <span style="background:var(--sidebar);border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:12px;color:var(--green)">Wails v2</span>
          <span style="background:var(--sidebar);border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:12px;color:var(--yellow)">WebKit2GTK</span>
          <span style="background:var(--sidebar);border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:12px;color:#38bdf8">Vue 3</span>
          <span style="background:var(--sidebar);border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:12px;color:#c9a0dc">Monaco</span>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" id="about-close">Close</button>
    </div>`);

  $('#about-close').onclick = closeModal;
  $('#about-github').onclick = () => OpenInBrowser('https://github.com/PerfLite');
  $('#about-telegram').onclick = () => OpenInBrowser('https://t.me/bashakul');
}

function showSettings() {
  openModal(`
    <div class="modal-header">Settings</div>
    <div class="modal-body">
      <div class="field">
        <label>Font size: <strong id="font-size-val">${state.fontSize}px</strong></label>
        <div style="display:flex;align-items:center;gap:10px;margin-top:6px">
          <span style="font-size:11px;color:var(--muted)">12</span>
          <input type="range" id="font-size-slider" min="12" max="20" value="${state.fontSize}" style="flex:1;accent-color:var(--accent)">
          <span style="font-size:11px;color:var(--muted)">20</span>
        </div>
      </div>
      <div class="field" style="margin-top:16px;">
        <label>Theme</label>
        <select class="input" id="theme-selector" style="margin-top:6px">
          <option value="system" ${state.theme === 'system' ? 'selected' : ''}>System</option>
          <option value="light" ${state.theme === 'light' ? 'selected' : ''}>Light</option>
          <option value="dark" ${state.theme === 'dark' ? 'selected' : ''}>Dark</option>
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn primary" id="settings-close">Done</button>
    </div>`);
  const slider = $('#font-size-slider');
  const applySize = () => {
    const val = parseInt(slider.value);
    state.fontSize = val;
    $('#font-size-val').textContent = val + 'px';
    const zoom = val / 14;
    document.getElementById('app').style.zoom = zoom;
  };
  slider.oninput = applySize;
  slider.onchange = applySize;
  $('#settings-close').onclick = () => { 
    saveFontSize(); 
    saveTheme();
    closeModal(); 
  };
}

async function saveTheme() {
  const sel = $('#theme-selector');
  if (sel) {
    state.theme = sel.value;
    try { localStorage.setItem('gitdesktop-theme', state.theme); } catch(e) {}
    applyTheme();
    // Also save to backend config if SaveConfigKey is available (import it if needed, or just rely on localstorage)
    // Actually wait, let's just use localStorage for simplicity, but we can also call Wails if we imported it.
  }
}

function applyTheme() {
  let t = state.theme || 'system';
  if (t === 'system') {
    t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.body.className = t === 'light' ? 'theme-light' : 'theme-dark';
}

function saveFontSize() {
  try { localStorage.setItem('gitdesktop-fontsize', state.fontSize); } catch(e) {}
}

function loadFontSize() {
  try {
    const saved = localStorage.getItem('gitdesktop-fontsize');
    if (saved) {
      state.fontSize = parseInt(saved) || 14;
      const zoom = state.fontSize / 14;
      const app = document.getElementById('app');
      if (app) app.style.zoom = zoom;
    }
  } catch(e) {}
}

async function openRepo(idx) {
  const repo = state.repos[idx];
  if (!repo) return;
  state.currentRepo = repo;
  state.activeTab = 'changes';
  state.activeFile = null;
  showScreen('repo');
  await SetCurrentRepo(repo);
  renderRepoScreen(repo);

  try {
    const saved = await GetSavedRepoPath(repo.name);
    if (saved) {
      const res = await OpenLocalRepo(saved);
      if (res.ok) {
        refreshChanges();
        refreshBranch();
        await StartWatcher();
      }
    }
  } catch(e) {
    console.error('openRepo error:', e);
  }
}

function renderRepoScreen(repo) {
  const s = $('#screen-repo');
  s.innerHTML = `
    <div class="repo-toolbar">
      <div class="left">
        <button class="icon-btn" id="back-btn" title="All repositories">${icon('back')}</button>
        <div class="toolbar-pill">
          ${icon('book')} <strong style="margin-left:4px;">${repo.name}</strong>
        </div>
        <div class="toolbar-pill" id="branch-pill" title="Switch branch" style="display:flex; align-items:center; gap:6px; padding:4px 8px;">
          <div style="flex-shrink:0; display:flex; color:var(--muted);">${icon('branch')}</div>
          <div style="display:flex; flex-direction:column; line-height:1.2; align-items:flex-start;">
             <span style="font-size:11px; color:var(--muted); font-weight:normal;">Current branch</span>
             <div style="display:flex; align-items:center;">
               <strong id="branch-name" style="font-size:13px;">${repo.default_branch || 'main'}</strong>
               <span id="branch-ahead" class="ahead"></span>
             </div>
          </div>
          <div style="flex-shrink:0; display:flex; margin-left:4px; color:var(--muted); align-items:center;">${icon('chevron_down')}</div>
        </div>
      </div>
      <div class="right">
        <button class="btn" id="push-btn"><span style="color:#3fb950">${icon('cloud')}</span> Push origin</button>
        <button class="btn" id="fetch-btn"><span style="color:#58a6ff">${icon('cloud')}</span> Fetch origin</button>
        <button class="btn" id="clone-repo-btn"><span style="color:#a371f7">${icon('download')}</span> Clone</button>
        <button class="btn" id="view-github-btn"><span style="color:#3fb950">${icon('globe')}</span> View on GitHub</button>
        <button class="btn" id="show-files-btn"><span style="color:#d29922">${icon('folder')}</span> Show in Files</button>
        <button class="btn danger" id="delete-btn"><span style="color:#f85149">${icon('trash')}</span> Delete repo</button>
      </div>
    </div>
    <div class="repo-body">
      <div class="changes-panel">
        <div class="panel-tabs">
          <div class="panel-tab active" id="tab-changes">Changes</div>
          <div class="panel-tab" id="tab-history">History</div>
          <div class="panel-tab" id="tab-files">Files</div>
          <div class="panel-tab" id="tab-readme">Readme</div>
        </div>
        <div id="panel-content" style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0;">
          <div class="changes-list" id="changes-list"></div>
        </div>
        <div class="commit-form">
          <div class="form-row" style="align-items:center; margin-bottom: 6px;">
            <div class="avatar" style="width:24px;height:24px;font-size:11px;">${state.avatarUrl
              ? `<img src="${state.avatarUrl}" style="width:24px;height:24px;border-radius:50%;object-fit:cover">`
              : `<span>${(state.user||'?')[0].toUpperCase()}</span>`
            }</div>
            <input class="input" id="commit-summary" placeholder="Summary (required)" style="flex:1;">
          </div>
          <div class="inputs" style="margin-bottom:8px;">
            <textarea class="input commit-desc-input" id="commit-desc" placeholder="Description" rows="1" style="width:100%; min-height:80px; max-height:300px; resize:none; overflow-y:auto;" oninput="this.style.height = ''; this.style.height = Math.min(this.scrollHeight, 300) + 'px'"></textarea>
          </div>
          <div class="commit-error" id="commit-error"></div>
          <button class="btn primary commit-btn" id="commit-btn" disabled style="background:#1f6feb; border-color:#1f6feb; color:#fff; width:100%; justify-content:center; padding:6px; font-weight:bold;">
            Commit to <strong style="margin-left:4px;">${repo.default_branch || 'main'}</strong>
          </button>
        </div>
      </div>
      <div class="panel-resizer" id="panel-resizer"></div>
      <div class="diff-panel">
        <div class="diff-header" id="diff-header">Select a file to see the diff</div>
        <div class="diff-content" id="diff-content">
          <div class="diff-placeholder">Select a file from the list</div>
        </div>
      </div>
    </div>`;

  $('#back-btn').onclick = backToMain;
  $('#branch-pill').onclick = showBranchPicker;
  $('#push-btn').onclick = doPush;
  $('#fetch-btn').onclick = doFetch;
  $('#clone-repo-btn').onclick = () => showCloneDialog(repo.clone_url, repo.name);
  $('#view-github-btn').onclick = () => OpenInBrowser(repo.html_url);
  $('#show-files-btn').onclick = doShowFiles;
  $('#delete-btn').onclick = showDeleteDialog;
  $('#tab-changes').onclick = () => switchTab('changes');
  $('#tab-history').onclick = () => switchTab('history');
  $('#tab-files').onclick = () => switchTab('files');
  $('#tab-readme').onclick = () => switchTab('readme');
  $('#commit-btn').onclick = doCommit;

  const resizer = $('#panel-resizer');
  const changesPanel = $('.changes-panel');
  let isResizing = false;
  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizer.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const repoBody = $('.repo-body');
    const rect = repoBody.getBoundingClientRect();
    let newWidth = e.clientX - rect.left;
    if (newWidth < 150) newWidth = 150;
    if (newWidth > 400) newWidth = 400;
    changesPanel.style.width = newWidth + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });

  refreshChanges();
  refreshBranch();
}

async function backToMain() {
  await StopWatcher();
  showScreen('main');
  renderMain();
}

function switchTab(tab) {
  state.activeTab = tab;
  state.activeFile = null;
  $('#tab-changes').classList.toggle('active', tab === 'changes');
  $('#tab-history').classList.toggle('active', tab === 'history');
  $('#tab-files').classList.toggle('active', tab === 'files');
  $('#tab-readme').classList.toggle('active', tab === 'readme');
  const commitForm = $('.commit-form');
  commitForm.style.display = tab === 'changes' ? '' : 'none';
  resetDiffPanel();
  
  const panel = $('#panel-content');
  if (tab === 'changes') {
    panel.innerHTML = '<div class="changes-list" id="changes-list"></div>';
    refreshChanges();
  } else if (tab === 'history') {
    panel.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">Loading...</div>';
    loadHistory();
  } else if (tab === 'files') {
    panel.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">Loading...</div>';
    loadFileTree();
  } else if (tab === 'readme') {
    panel.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">Loading...</div>';
    loadReadme();
  }
}

function resetDiffPanel() {
  const header = $('#diff-header');
  const content = $('#diff-content');
  if (header) header.textContent = 'Select a file to see the diff';
  if (content) {
    content.className = 'diff-content';
    content.innerHTML = '<div class="diff-placeholder">Select a file from the list</div>';
  }
}

async function loadReadme() {
  const header = $('#diff-header');
  const content = $('#diff-content');
  if (header) header.textContent = 'README';
  if (content) {
    content.className = 'diff-content';
    content.innerHTML = '<div class="diff-placeholder">Loading README...</div>';
  }
  try {
    const path = await GetLocalPath();
    let readme;
    if (path) {
      readme = await GetReadme();
    } else {
      readme = await GetRemoteReadme();
    }
    if (!readme) {
      if (content) content.innerHTML = '<div class="diff-placeholder">No README found</div>';
      return;
    }
    if (content) {
      content.className = 'diff-content md-rendered';
      content.innerHTML = renderMarkdown(readme);
    }
  } catch(e) {
    if (content) content.innerHTML = '<div class="diff-placeholder">Failed to load README</div>';
  }
}

function renderMarkdown(text) {
  let html = escHtml(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:var(--accent)">$1</a>');
  html = html.replace(/^(?!<[hbulo]|<\/|<li|<code|<pre|<a|<strong|<em)(.+)$/gm, '<p>$1</p>');
  html = html.replace(/\n{2,}/g, '\n');
  return html;
}

async function loadFileTree() {
  const panel = $('#panel-content');
  if (!panel) return;
  panel.innerHTML = '<div class="diff-placeholder">Loading files...</div>';
  try {
    const path = await GetLocalPath();
    let tree;
    if (path) {
      tree = await GetFileTree();
    } else {
      tree = await GetRemoteFileTree();
    }
    if (!tree || !tree.length) {
      panel.innerHTML = '<div class="no-changes" style="flex-direction:column"><span style="color:var(--muted)">No files found</span>';
      if (!path) {
        panel.innerHTML += '<button class="btn" id="files-clone-btn" style="margin-top:8px">' + icon('download') + ' Clone</button>';
      }
      panel.innerHTML += '</div>';
      const cloneBtn = $('#files-clone-btn');
      if (cloneBtn) cloneBtn.onclick = () => showCloneDialog(state.currentRepo?.clone_url, state.currentRepo?.name);
      return;
    }
    panel.innerHTML = `<div class="file-tree" id="file-tree">${renderFileTree(tree)}</div>`;
    panel.querySelectorAll('.ft-item').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        if (el.dataset.dir === 'true') {
          el.classList.toggle('collapsed');
          const children = el.querySelector('.ft-children');
          if (children) children.classList.toggle('hidden');
        } else {
          $$('.ft-item').forEach(x => x.classList.remove('selected'));
          el.classList.add('selected');
          showFileContent(el.dataset.path);
        }
      };
    });
  } catch(e) {
    panel.innerHTML = '<div class="no-changes"><span style="color:var(--muted)">Failed to load files</span></div>';
  }
}

function renderFileTree(nodes, depth = 0) {
  if (!nodes || !nodes.length) return '';
  return nodes.map(n => {
    if (n.is_dir) {
      return `<div class="ft-item ft-dir" data-dir="true" data-path="${n.path}" style="padding-left:${depth * 16 + 8}px">
        <span class="ft-arrow">&#9656;</span>
        <span style="color:var(--accent)">${icon('folder')}</span>
        <span>${n.name}</span>
        <div class="ft-children hidden">${renderFileTree(n.children, depth + 1)}</div>
      </div>`;
    }
    const ext = (n.name.split('.').pop() || '').toLowerCase();
    const extColors = { js: '#f1e05a', ts: '#3178c6', go: '#00ADD8', py: '#3572A5', rs: '#dea584', rb: '#701516', java: '#b07219', html: '#e34c26', css: '#563d7c', json: '#40d47e', md: '#ffffff', sh: '#89e051', yml: '#cb171e', yaml: '#cb171e', toml: '#9c4221' };
    const color = extColors[ext] || 'var(--muted)';
    return `<div class="ft-item ft-file" data-dir="false" data-path="${n.path}" style="padding-left:${depth * 16 + 24}px">
      <span style="width:14px;height:14px;border-radius:2px;background:${color};opacity:0.6;flex-shrink:0"></span>
      <span>${n.name}</span>
    </div>`;
  }).join('');
}

async function showFileContent(fpath) {
  const header = $('#diff-header');
  const content = $('#diff-content');
  state.editingFile = null;
  state.editingOriginal = null;
  if (header) header.textContent = fpath;
  if (content) {
    content.className = 'diff-content';
    content.innerHTML = '<div class="diff-placeholder">Loading...</div>';
  }
  try {
    const ext = (fpath.split('.').pop() || '').toLowerCase();
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'];
    const isImage = imageExts.includes(ext);

    if (isImage) {
      const path = await GetLocalPath();
      if (path) {
        const filePath = path + '/' + fpath;
        if (content) {
          content.className = 'diff-content';
          content.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:16px">
            <img src="file://${filePath}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;border:1px solid var(--border)" onerror="this.parentElement.innerHTML='<div class=\\'diff-placeholder\\'>Failed to load image</div>'">
          </div>`;
        }
      } else {
        try {
          const res = await GetRemoteFileContentBase64(fpath);
          if (res.ok && content) {
            const dataUrl = `data:image/${ext === 'svg' ? 'svg+xml' : ext};base64,${res.content}`;
            content.className = 'diff-content';
            content.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:16px">
              <img src="${dataUrl}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;border:1px solid var(--border)" onerror="this.parentElement.innerHTML='<div class=\\'diff-placeholder\\'>Failed to load image</div>'">
            </div>`;
          } else if (content) {
            content.innerHTML = '<div class="diff-placeholder">Failed to load image</div>';
          }
        } catch(e2) {
          if (content) content.innerHTML = '<div class="diff-placeholder">Failed to load image</div>';
        }
      }
      return;
    }

    const path = await GetLocalPath();
    let res;
    if (path) {
      res = await GetFileContent(fpath);
    } else {
      res = await GetRemoteFileContent(fpath);
    }
    if (!res.ok) {
      if (content) content.innerHTML = `<div class="diff-placeholder">${escHtml(res.error)}</div>`;
      return;
    }
    if (['md', 'mdx', 'markdown'].includes(ext)) {
      if (content) {
        content.className = 'diff-content md-rendered';
        content.innerHTML = renderMarkdown(res.content);
      }
    } else {
      const lines = res.content.split('\n');
      if (content) {
        content.innerHTML = lines.map((line, i) => {
          const num = String(i + 1).padStart(3, ' ');
          return `<span class="diff-line"><span style="color:var(--muted);user-select:none;display:inline-block;width:40px;text-align:right;margin-right:12px;font-size:11px">${num}</span>${escHtml(line) || ' '}</span>`;
        }).join('');
        content.style.fontFamily = 'monospace';
        content.style.fontSize = '12px';
        content.style.lineHeight = '1.6';
      }
    }
    if (path && header && !['md', 'mdx', 'markdown'].includes(ext) && !isImage) {
      const editBtn = document.createElement('button');
      editBtn.className = 'btn-icon edit-btn';
      editBtn.innerHTML = icons.edit;
      editBtn.title = 'Edit file';
      editBtn.onclick = () => enterEditMode(fpath, res.content);
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.gap = '8px';
      header.textContent = fpath;
      header.appendChild(editBtn);
    }
  } catch(e) {
    if (content) content.innerHTML = '<div class="diff-placeholder">Failed to load file</div>';
  }
}

function enterEditMode(fpath, originalContent) {
  const header = $('#diff-header');
  const content = $('#diff-content');
  if (!header || !content) return;
  state.editingFile = fpath;
  state.editingOriginal = originalContent;
  header.innerHTML = '';
  const pathSpan = document.createElement('span');
  pathSpan.textContent = fpath;
  pathSpan.style.flex = '1';
  header.appendChild(pathSpan);
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-sm btn-primary';
  saveBtn.textContent = 'Save';
  saveBtn.onclick = saveFile;
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-sm btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = cancelEdit;
  header.appendChild(saveBtn);
  header.appendChild(cancelBtn);
  content.className = 'diff-content editor-mode';
  const textarea = document.createElement('textarea');
  textarea.className = 'file-editor';
  textarea.value = originalContent;
  textarea.style.fontSize = state.fontSize + 'px';
  textarea.spellcheck = false;
  content.innerHTML = '';
  content.appendChild(textarea);
  textarea.focus();
  textarea.setSelectionRange(0, 0);
}

async function saveFile() {
  const content = $('#diff-content');
  const textarea = content ? content.querySelector('textarea') : null;
  if (!textarea || !state.editingFile) return;
  const newContent = textarea.value;
  const res = await WriteFile(state.editingFile, newContent);
  if (res.ok) {
    cancelEdit();
    showFileContent(state.editingFile);
    toast('File saved');
  } else {
    toast('Save failed: ' + (res.error || 'unknown'), 'error');
  }
}

function cancelEdit() {
  state.editingFile = null;
  state.editingOriginal = null;
  const header = $('#diff-header');
  if (header) {
    header.innerHTML = '';
    header.style.display = '';
    header.style.alignItems = '';
    header.style.gap = '';
  }
}

async function refreshChanges() {
  try {
    const res = await GetChanges();
    const list = $('#changes-list');
    if (!list) return;

    if (!res.ok) {
      list.innerHTML = `<div class="no-changes" style="flex-direction:column">
        <span style="color:var(--muted)">No local repository</span>
        <button class="btn" id="open-local-btn" style="margin-top:8px">Open local folder...</button>
      </div>`;
      $('#open-local-btn').onclick = showOpenLocalDialog;
      setCommitBtn(false);
      return;
    }

    const changes = res.changes || [];
    const stashes = (await GetStashes()) || [];
    
    let html = '';
    
    // Header for changes
    html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid var(--border); background:var(--sidebar);">
      <span style="font-size:12px; font-weight:600; color:var(--text);">${changes.length} changed file${changes.length !== 1 ? 's' : ''}</span>
      ${changes.length > 0 ? `<button id="btn-stash-all" class="btn" style="font-size:11px; padding:2px 8px; background:transparent; border-color:var(--border);">Stash all</button>` : ''}
    </div>`;

    if (!changes.length) {
      html += `<div class="no-changes">${icon('check')}<span>No local changes</span></div>`;
      setCommitBtn(false);
      autoCommitMessage([]);
    } else {
      html += `<div style="flex:1; overflow-y:auto;">` + changes.map((c, i) => {
        let cls = (c.code||'').includes('M') ? 'ci-M' : c.code === '??' || (c.code||'').includes('A') ? 'ci-A' : (c.code||'').includes('D') ? 'ci-D' : 'ci-dir';
        let ico = c.is_dir ? icon('folder') : (c.code||'').includes('M') ? icon('edit') : (c.code||'').includes('D') ? icon('minus') : icon('plus');
        
        if (c.is_conflicted) {
          cls = 'ci-C';
          ico = `<svg viewBox="0 0 16 16" style="fill:var(--yellow);width:14px;height:14px"><path d="M8.22 1.754a.25.25 0 00-.44 0L1.698 13.132a.25.25 0 00.22.368h12.164a.25.25 0 00.22-.368L8.22 1.754zm-1.763-.707c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0114.082 15H1.918a1.75 1.75 0 01-1.543-2.575L6.457 1.047zM9 11a1 1 0 11-2 0 1 1 0 012 0zm-.25-5.25a.75.75 0 00-1.5 0v2.5a.75.75 0 001.5 0v-2.5z"></path></svg>`;
        }
        
        return `<div class="change-item" data-idx="${i}" data-path="${c.path}" data-dir="${c.is_dir}" data-conflicted="${c.is_conflicted}">
          <span class="ci-icon ${cls}">${ico}</span>
          <span class="ci-path">${c.display}</span>
          <span class="ci-code ${cls}">${c.is_dir ? '' : c.code}</span>
        </div>`;
      }).join('') + `</div>`;
    }

    if (stashes.length > 0) {
      html += `<div style="border-top:1px solid var(--border); background:var(--sidebar);">
        <div style="padding:8px 12px; font-size:12px; font-weight:600; color:var(--text); border-bottom:1px solid var(--border);">Stashed Changes</div>
        <div style="max-height:150px; overflow-y:auto;">
          ${stashes.map(s => `
            <div style="padding:8px 12px; border-bottom:1px solid var(--border); font-size:12px;">
              <div style="font-weight:600; color:var(--text); margin-bottom:4px;">${escHtml(s.message)}</div>
              <div style="color:var(--muted); font-size:11px; display:flex; justify-content:space-between; align-items:center;">
                <span>${s.date}</span>
                <div style="display:flex; gap:6px;">
                  <button class="btn btn-restore-stash" data-idx="${s.index}" style="font-size:11px; padding:2px 6px;">Restore</button>
                  <button class="btn btn-drop-stash" data-idx="${s.index}" style="font-size:11px; padding:2px 6px; color:var(--danger); border-color:var(--danger);">Discard</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>`;
    }

    list.innerHTML = html;

    list.querySelectorAll('.change-item').forEach(el => {
      el.onclick = () => selectFile(parseInt(el.dataset.idx));
    });

    const btnStashAll = list.querySelector('#btn-stash-all');
    if (btnStashAll) {
      btnStashAll.onclick = async () => {
        btnStashAll.disabled = true;
        const r = await Stash();
        if (r.ok) { toast('Changes stashed'); refreshChanges(); }
        else toast('Failed to stash: ' + r.error, 'error');
      };
    }

    list.querySelectorAll('.btn-restore-stash').forEach(btn => {
      btn.onclick = async () => {
        btn.disabled = true;
        const r = await StashPop(btn.dataset.idx);
        if (r.ok) { toast('Stash restored'); refreshChanges(); }
        else { toast('Failed to restore: ' + r.error, 'error'); btn.disabled = false; }
      };
    });

    list.querySelectorAll('.btn-drop-stash').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Are you sure you want to discard this stash?')) return;
        btn.disabled = true;
        const r = await StashDrop(btn.dataset.idx);
        if (r.ok) { toast('Stash discarded'); refreshChanges(); }
        else { toast('Failed to discard: ' + r.error, 'error'); btn.disabled = false; }
      };
    });

    setCommitBtn(changes.length > 0);
    autoCommitMessage(changes);
  } catch(e) {
    console.error('refreshChanges error:', e);
  }
}

function setCommitBtn(enabled) {
  const btn = $('#commit-btn');
  if (!btn) return;
  btn.disabled = !enabled;
  btn.style.opacity = enabled ? '1' : '.45';
}

function autoCommitMessage(changes) {
  const inp = $('#commit-summary');
  if (!inp || inp.value.trim()) return;
  if (!changes || !changes.length) return;
  if (changes.length === 1) {
    const c = changes[0];
    const name = (c.display || '').replace(/\/$/, '').split('/').pop();
    const verb = (c.code||'').includes('M') ? 'Update' : (c.code||'').includes('D') ? 'Remove' : 'Add';
    inp.value = `${verb} ${name}`;
  } else {
    const mod = changes.filter(c => (c.code||'').includes('M')).length;
    const add = changes.filter(c => c.code === '??' || (c.code||'').includes('A')).length;
    const del = changes.filter(c => (c.code||'').includes('D')).length;
    const parts = [];
    if (add) parts.push(`Add ${add} file${add>1?'s':''}`);
    if (mod) parts.push(`update ${mod} file${mod>1?'s':''}`);
    if (del) parts.push(`remove ${del} file${del>1?'s':''}`);
    inp.value = parts.join(', ');
  }
}

async function selectFile(idx) {
  $$('.change-item').forEach((el, i) => el.classList.toggle('active', i === idx));
  const items = $$('.change-item');
  const item = items[idx];
  if (!item || item.dataset.dir === 'true') return;
  const fpath = item.dataset.path;
  const header = $('#diff-header');
  
  if (item.dataset.conflicted === 'true') {
    if (header) header.innerHTML = `<span style="color:var(--yellow)">⚠ Merge Conflict</span> <span style="margin-left:8px;font-family:monospace">${fpath}</span>`;
    renderConflictResolver(fpath);
    return;
  }
  
  if (header) header.textContent = fpath;
  try {
    const res = await GetDiff(fpath);
    renderDiff(res.diff || '');
  } catch(e) {
    renderDiff('');
  }
}

async function renderConflictResolver(fpath) {
  const el = $('#diff-content');
  if (!el) return;
  el.innerHTML = '<div style="padding:20px;text-align:center;">Loading conflict data...</div>';
  try {
    const res = await GetConflictBlocks(fpath);
    if (!res.ok) throw new Error(res.error);
    const blocks = res.blocks || [];
    
    window.conflictBlocks = blocks;
    window.conflictPath = fpath;
    renderConflictBlocks();
  } catch(e) {
    el.innerHTML = `<div class="diff-placeholder">Failed to load conflict: ${escHtml(e.message||e)}</div>`;
  }
}

function renderConflictBlocks() {
  const el = $('#diff-content');
  let unresolvedCount = 0;
  
  let html = '<div style="padding:16px;">';
  window.conflictBlocks.forEach((b, i) => {
    if (b.type === 'normal') {
      html += `<pre style="color:var(--text);font-family:monospace;font-size:12px;margin-bottom:8px;white-space:pre-wrap;background:var(--sidebar);padding:8px;border-radius:4px;">${escHtml(b.content)}</pre>`;
    } else {
      if (!b.resolved) unresolvedCount++;
      html += `<div style="border:1px solid var(--border);border-radius:6px;margin-bottom:12px;overflow:hidden;background:var(--bg)">
        <div style="display:flex;">
          <div style="flex:1;border-right:1px solid var(--border);">
            <div style="background:var(--diff-add);padding:4px 8px;font-size:11px;font-weight:600;display:flex;justify-content:space-between;align-items:center;">
              <span style="color:var(--text)">Current Change</span>
              ${!b.resolved ? `<button class="btn primary" style="padding:2px 8px;font-size:11px;" onclick="resolveConflictBlock(${i}, 'current')">Accept Current</button>` : ''}
            </div>
            <pre style="padding:8px;font-family:monospace;font-size:12px;color:var(--text);margin:0;white-space:pre-wrap;">${escHtml(b.current)}</pre>
          </div>
          <div style="flex:1;">
            <div style="background:var(--diff-del);padding:4px 8px;font-size:11px;font-weight:600;display:flex;justify-content:space-between;align-items:center;">
              <span style="color:var(--text)">Incoming Change</span>
              ${!b.resolved ? `<button class="btn" style="padding:2px 8px;font-size:11px;border-color:var(--red);color:var(--red)" onclick="resolveConflictBlock(${i}, 'incoming')">Accept Incoming</button>` : ''}
            </div>
            <pre style="padding:8px;font-family:monospace;font-size:12px;color:var(--text);margin:0;white-space:pre-wrap;">${escHtml(b.incoming)}</pre>
          </div>
        </div>
        ${b.resolved ? `<div style="background:var(--sidebar);padding:4px 8px;font-size:11px;text-align:center;color:var(--green)">Resolved (${b.choice === 'current' ? 'Current' : 'Incoming'} Accepted)</div>` : ''}
      </div>`;
    }
  });
  html += `</div>`;
  
  html += `<div style="padding:16px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;align-items:center;background:var(--sidebar);position:sticky;bottom:0;">
    ${unresolvedCount > 0 ? `<span style="color:var(--muted);font-size:12px;margin-right:12px;">${unresolvedCount} conflict${unresolvedCount !== 1 ? 's' : ''} remaining</span>` : ''}
    <button class="btn primary" ${unresolvedCount > 0 ? 'disabled' : ''} onclick="commitConflictResolution()">Mark as Resolved</button>
  </div>`;
  
  el.innerHTML = html;
}

window.resolveConflictBlock = (idx, choice) => {
  const b = window.conflictBlocks[idx];
  b.resolved = true;
  b.choice = choice;
  b.type = 'normal';
  b.content = choice === 'current' ? b.current : b.incoming;
  renderConflictBlocks();
};

window.commitConflictResolution = async () => {
  const content = window.conflictBlocks.map(b => b.content).join('\\n');
  const r = await ResolveConflict(window.conflictPath, content);
  if (r.ok) {
    toast('Conflict resolved!');
    refreshChanges();
    renderDiff('');
  } else {
    toast('Failed to resolve: ' + r.error, 'error');
  }
};

function renderDiff(diff) {
  const el = $('#diff-content');
  if (!el) return;
  if (!diff) { el.innerHTML = '<div class="diff-placeholder">No diff available</div>'; return; }
  el.innerHTML = diff.split('\n').map(line => {
    let cls = '';
    if (line.startsWith('+') && !line.startsWith('+++')) cls = 'add';
    else if (line.startsWith('-') && !line.startsWith('---')) cls = 'del';
    else if (line.startsWith('@@')) cls = 'hunk';
    else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) cls = 'meta';
    return `<span class="diff-line ${cls}">${escHtml(line) || ' '}</span>`;
  }).join('');
}

async function showBranchPicker() {
  try {
    const existing = $('#branch-dropdown');
    if (existing) { existing.remove(); return; }

    const pill = $('#branch-pill');
    if (!pill) { toast('Error: pill not found', 'error'); return; }
    const rect = pill.getBoundingClientRect();

    const dropdown = document.createElement('div');
    dropdown.id = 'branch-dropdown';
    dropdown.style.cssText = `
      position:fixed; top:${rect.bottom + 4}px; left:${rect.left}px;
      background:var(--sidebar); border:1px solid var(--border); border-radius:8px;
      width:320px; max-height:450px; display:flex; flex-direction:column; z-index:500;
      box-shadow:0 8px 24px rgba(0,0,0,.5); overflow:hidden;
    `;
    
    // Show loading state immediately
    dropdown.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px;">Loading branches...</div>`;
    document.body.appendChild(dropdown);

    // Fetch branches
    const branches = await GetBranches();
    if (!branches || !branches.length) {
      dropdown.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px;">No local repo open</div>`;
      setTimeout(() => dropdown.remove(), 2000);
      return;
    }
    
    const current = $('#branch-name')?.textContent?.trim() || '';

    let html = `
      <div style="display:flex; border-bottom:1px solid var(--border); background:var(--sidebar);">
        <div id="br-tab-branches" style="flex:1; text-align:center; padding:10px; font-size:12px; font-weight:600; color:var(--text); border-bottom:2px solid var(--accent); cursor:pointer;">Branches</div>
        <div id="br-tab-prs" style="flex:1; text-align:center; padding:10px; font-size:12px; font-weight:600; color:var(--muted); cursor:pointer;">Pull requests</div>
      </div>
      <div id="br-search-bar" style="padding:10px; display:flex; align-items:center; border-bottom:1px solid var(--border); background:var(--sidebar);">
        <div style="flex:1; position:relative; display:flex; align-items:center;">
          <input type="text" id="branch-search-input" placeholder="Filter" style="width:100%; background:var(--bg); border:1px solid var(--border); border-radius:4px; padding:6px 8px 6px 30px; font-size:12px; color:var(--text); outline:none;">
          <div style="position:absolute; left:10px; color:var(--muted); pointer-events:none; display:flex;">
             <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"></path></svg>
          </div>
        </div>
        <button style="margin-left:8px; background:var(--bg); border:1px solid var(--border); padding:5px 12px; border-radius:4px; font-size:12px; color:var(--text); cursor:pointer;">New branch</button>
      </div>
      <div id="branch-list-container" style="overflow-y:auto; flex:1;"></div>
    `;
    
    dropdown.innerHTML = html;
    
    const listContainer = dropdown.querySelector('#branch-list-container');
    const input = document.getElementById('branch-search-input');
    let currentTab = 'branches';

    function renderBranchesList(list) {
      let res = `<div style="padding:8px 10px; font-size:11px; font-weight:600; color:var(--text); background:var(--header);">Default branch</div>`;
      list.forEach(b => {
        res += `<div class="branch-option" data-branch="${b}" style="padding:8px 14px; cursor:pointer; display:flex; align-items:center; gap:8px; font-size:13px; color:var(--text);">
          <span style="color:var(--text); width:14px; flex-shrink:0; display:flex;">${b === current ? '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path></svg>' : ''}</span>
          ${b}
        </div>`;
      });
      listContainer.innerHTML = res;
      listContainer.querySelectorAll('.branch-option').forEach(el => {
        el.onclick = () => doCheckout(el.dataset.branch);
        el.onmouseover = () => el.style.background = 'var(--hover)';
        el.onmouseout = () => el.style.background = '';
      });
    }

    renderBranchesList(branches);

    if (input) {
      input.focus();
      input.oninput = (e) => {
        if (currentTab !== 'branches') return;
        const q = e.target.value.toLowerCase();
        const filtered = branches.filter(b => b.toLowerCase().includes(q));
        renderBranchesList(filtered);
      };
    }
    
    $('#br-tab-branches').onclick = () => {
      currentTab = 'branches';
      $('#br-tab-branches').style.borderBottom = '2px solid var(--accent)';
      $('#br-tab-branches').style.color = 'var(--text)';
      $('#br-tab-prs').style.borderBottom = 'none';
      $('#br-tab-prs').style.color = 'var(--muted)';
      $('#br-search-bar').style.display = 'flex';
      renderBranchesList(branches);
    };
    
    $('#br-tab-prs').onclick = async () => {
      currentTab = 'prs';
      $('#br-tab-prs').style.borderBottom = '2px solid var(--accent)';
      $('#br-tab-prs').style.color = 'var(--text)';
      $('#br-tab-branches').style.borderBottom = 'none';
      $('#br-tab-branches').style.color = 'var(--muted)';
      $('#br-search-bar').style.display = 'none';
      
      listContainer.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px;">Loading PRs...</div>';
      const r = await GetPullRequests();
      if (!r.ok) {
        listContainer.innerHTML = `<div style="padding:20px;text-align:center;color:var(--red);font-size:12px;">${r.error}</div>`;
        return;
      }
      const prs = r.prs || [];
      if (!prs.length) {
        listContainer.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px;">No open pull requests found.</div>`;
        return;
      }
      
      let html = '';
      prs.forEach(pr => {
        html += `<div class="pr-option" data-num="${pr.number}" data-ref="${pr.head.ref}" style="padding:10px 14px; cursor:pointer; border-bottom:1px solid var(--border); display:flex; flex-direction:column; gap:4px;">
          <div style="font-size:13px; color:var(--text); font-weight:600;">${escHtml(pr.title)}</div>
          <div style="font-size:11px; color:var(--muted);">#${pr.number} opened by ${escHtml(pr.user.login)}</div>
        </div>`;
      });
      listContainer.innerHTML = html;
      listContainer.querySelectorAll('.pr-option').forEach(el => {
        el.onclick = async () => {
          dropdown.remove();
          const n = parseInt(el.dataset.num);
          const ref = el.dataset.ref;
          toast('Fetching PR #' + n + '...');
          const cres = await CheckoutPullRequest(n, ref);
          if (cres.ok) {
            toast('Checked out PR ' + ref);
            refreshBranch();
            refreshChanges();
          } else {
            toast('Failed to checkout PR: ' + cres.error, 'error');
          }
        };
        el.onmouseover = () => el.style.background = 'var(--hover)';
        el.onmouseout = () => el.style.background = '';
      });
    };

    setTimeout(() => {
      document.addEventListener('click', function close(e) {
        if (dropdown && !dropdown.contains(e.target) && pill && !pill.contains(e.target)) {
          dropdown.remove();
          document.removeEventListener('click', close);
        }
      });
    }, 100); // 100ms delay to be completely safe against bubbling

  } catch(e) {
    console.error('showBranchPicker error:', e);
    toast('Picker Error: ' + e.message, 'error');
  }
}

async function doCheckout(branch) {
  closeModal();
  const dd = $('#branch-dropdown');
  if (dd) dd.remove();
  try {
    const res = await CheckoutBranch(branch);
    if (res.ok) {
      refreshBranch();
      refreshChanges();
      toast(`Switched to ${branch}`);
    } else {
      toast(`${res.error}`, 'error');
    }
  } catch(e) {
    toast(`${e}`, 'error');
  }
}

async function loadHistory() {
  try {
    const path = await GetLocalPath();
    let commits;
    if (path) {
      commits = await GetHistory();
    } else {
      commits = await GetRemoteHistory();
    }
    const panel = $('#panel-content');
    if (!panel) return;
    
    // --- Compute Graph Lanes ---
    let lanes = [];
    commits.forEach(c => {
      let l = lanes.indexOf(c.sha);
      if (l === -1) { l = lanes.length; lanes.push(c.sha); }
      c.laneIndex = l;
      c.activeLanes = [...lanes]; // Lanes entering this commit from top
      
      if (c.parents && c.parents.length > 0) {
        lanes[l] = c.parents[0];
        for (let i = 1; i < c.parents.length; i++) {
          if (!lanes.includes(c.parents[i])) lanes.push(c.parents[i]);
        }
      } else {
        lanes.splice(l, 1);
      }
      c.nextLanes = [...lanes]; // Lanes exiting this commit to bottom
    });

    const colors = ['#1f6feb', '#56d364', '#d2a8ff', '#f78166', '#ffa657', '#3fb950'];

    panel.innerHTML = `<div class="history-list" style="padding:10px 0; background:var(--bg); height:100%; overflow-y:auto;">${
      (commits || []).map(c => {
        const laneW = 12;
        const svgW = Math.max(c.activeLanes.length, c.nextLanes.length, 1) * laneW + 16;
        let svg = `<svg width="${svgW}" height="48" style="flex-shrink:0; margin-right:8px;">`;
        
        // Draw lines from previous commits (top) to this commit
        c.activeLanes.forEach((sha, i) => {
          const col = colors[i % colors.length];
          const x = i * laneW + 10;
          if (i === c.laneIndex) {
            svg += `<path d="M ${x} 0 L ${x} 24" stroke="${col}" stroke-width="2" fill="none"/>`;
          } else {
            // It passes through, find where it goes in nextLanes
            const nextIdx = c.nextLanes.indexOf(sha);
            if (nextIdx !== -1) {
              const nx = nextIdx * laneW + 10;
              if (nx === x) {
                svg += `<path d="M ${x} 0 L ${x} 48" stroke="${col}" stroke-width="2" fill="none"/>`;
              } else {
                svg += `<path d="M ${x} 0 C ${x} 24, ${nx} 24, ${nx} 48" stroke="${col}" stroke-width="2" fill="none"/>`;
              }
            }
          }
        });

        // Draw lines from this commit to parents (bottom)
        if (c.parents) {
          c.parents.forEach((p, pIdx) => {
            const nextIdx = c.nextLanes.indexOf(p);
            if (nextIdx !== -1) {
              const nx = nextIdx * laneW + 10;
              const x = c.laneIndex * laneW + 10;
              const col = colors[nextIdx % colors.length];
              if (nx === x) {
                svg += `<path d="M ${x} 24 L ${x} 48" stroke="${col}" stroke-width="2" fill="none"/>`;
              } else {
                svg += `<path d="M ${x} 24 C ${x} 36, ${nx} 36, ${nx} 48" stroke="${col}" stroke-width="2" fill="none"/>`;
              }
            }
          });
        }
        
        // Draw the commit dot
        const cx = c.laneIndex * laneW + 10;
        const dotCol = colors[c.laneIndex % colors.length];
        svg += `<circle cx="${cx}" cy="24" r="4" fill="var(--bg)" stroke="${dotCol}" stroke-width="2"/>`;
        svg += `</svg>`;

        const avatar = c.avatarURL || `https://www.gravatar.com/avatar/?d=identicon`;

        return `
        <div class="history-item" data-sha="${c.sha}" style="cursor:pointer; display:flex; align-items:flex-start; padding:4px 16px; min-height:48px;">
          ${svg}
          <img src="${avatar}" style="width:24px; height:24px; border-radius:50%; margin-top:12px; margin-right:12px; flex-shrink:0;">
          <div style="display:flex; flex-direction:column; justify-content:center; flex:1; min-width:0; padding-top:6px; border-bottom:1px solid var(--border); padding-bottom:10px;">
            <div style="font-weight:600; font-size:13px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(c.message)}</div>
            <div style="font-size:11px; color:var(--muted); margin-top:2px;">
              <span style="font-weight:500;">${c.author}</span> committed &bull; 
              <span style="font-family:monospace; color:var(--text);">${c.sha}</span> &bull; 
              ${c.date}
            </div>
          </div>
        </div>`;
      }).join('') || '<div style="padding:20px; text-align:center; color:var(--muted);">No commits</div>'
    }</div>`;

    panel.querySelectorAll('.history-item').forEach(el => {
      el.onclick = () => showCommitDiff(el.dataset.sha);
      el.onmouseover = () => el.style.background = 'var(--hover)';
      el.onmouseout = () => el.style.background = '';
    });
  } catch(e) {
    console.error('loadHistory error:', e);
  }
}

async function showCommitDiff(sha) {
  $$('.history-item').forEach(el => el.style.borderLeft = '');
  $$('.history-item').forEach(el => {
    if (el.dataset.sha === sha) el.style.borderLeft = '2px solid var(--accent)';
  });
  const header = $('#diff-header');
  const content = $('#diff-content');
  if (header) header.textContent = `Commit ${sha} - loading...`;
  if (content) content.innerHTML = '<div class="diff-placeholder">Loading diff...</div>';

  try {
    const res = await GetCommitDiff(sha);
    if (header) header.textContent = `Commit ${sha}`;
    renderDiff(res.diff || '');
  } catch(e) {
    if (header) header.textContent = `Commit ${sha}`;
    renderDiff('');
  }
}

async function refreshBranch() {
  try {
    const info = await GetBranchInfo();
    const el = $('#branch-name');
    if (el) el.textContent = info.branch || state.currentRepo?.default_branch || 'main';
    const ahead = $('#branch-ahead');
    if (ahead) {
      const parts = [];
      if (info.ahead) parts.push(`+${info.ahead}`);
      if (info.behind) parts.push(`-${info.behind}`);
      ahead.textContent = parts.join(' ');
    }
  } catch(e) {
    console.error('refreshBranch error:', e);
  }
}

async function doCommit() {
  const summary = $('#commit-summary');
  const desc = $('#commit-desc');
  const msg = summary?.value?.trim() || '';
  const description = desc?.value?.trim() || '';
  if (!msg) { $('#commit-error').textContent = 'Summary is required'; return; }
  $('#commit-error').textContent = '';
  setCommitBtn(false);
  try {
    const res = await Commit(msg, description);
    if (res.ok) {
      if (summary) summary.value = '';
      if (desc) desc.value = '';
      refreshChanges();
      refreshBranch();
      const dc = $('#diff-content');
      if (dc) dc.innerHTML = '<div class="diff-placeholder">Select a file from the list</div>';
    } else {
      $('#commit-error').textContent = res.error;
      setCommitBtn(true);
    }
  } catch(e) {
    $('#commit-error').textContent = String(e);
    setCommitBtn(true);
  }
}

async function doFetch() {
  const btn = $('#fetch-btn');
  if (btn) { btn.textContent = 'Fetching...'; btn.disabled = true; }
  try {
    await Fetch();
  } catch(e) {
    console.error('doFetch error:', e);
    if (btn) { btn.innerHTML = `${icon('cloud')} Fetch origin`; btn.disabled = false; }
  }
}

async function doPush() {
  const btn = $('#push-btn');
  if (btn) { btn.textContent = 'Pushing...'; btn.disabled = true; }
  try {
    await Push();
  } catch(e) {
    console.error('doPush error:', e);
    if (btn) { btn.innerHTML = `${icon('cloud')} Push origin`; btn.disabled = false; }
  }
}

async function doShowFiles() {
  try {
    const path = await GetLocalPath();
    const res = await OpenInFiles(path);
    if (!res.ok) toast('Open a local folder first', 'error');
  } catch(e) {
    console.error('doShowFiles error:', e);
  }
}

function showOpenLocalDialog() {
  const repo = state.currentRepo;
  openModal(`
    <div class="modal-header">Open local repository</div>
    <div class="modal-body">
      <p style="color:var(--muted);font-size:12px;margin-bottom:12px">Enter path to local clone. If it doesn't exist - it will be cloned.</p>
      <div class="field">
        <label>Local path</label>
        <input class="input" id="local-path-input" placeholder="/home/user/projects/${repo.name}" value="">
      </div>
      <div id="open-local-error" class="error-text"></div>
    </div>
    <div class="modal-footer">
      <button class="btn" id="open-local-cancel">Cancel</button>
      <button class="btn primary" id="open-local-ok">Open / Clone</button>
    </div>`);
  $('#open-local-cancel').onclick = closeModal;
  $('#open-local-ok').onclick = doOpenLocal;
}

async function doOpenLocal() {
  const path = $('#local-path-input')?.value?.trim();
  if (!path) { $('#open-local-error').textContent = 'Path is required'; return; }
  const repo = state.currentRepo;

  try {
    const res = await OpenLocalRepo(path);
    if (res.ok) {
      closeModal();
      refreshChanges();
      refreshBranch();
      await StartWatcher();
      return;
    }

    const dest = path.endsWith(repo.name) ? path : `${path}/${repo.name}`;
    closeModal();
    toast(`Cloning ${repo.name}...`);
    await CloneRepo(repo.clone_url, dest);
  } catch(e) {
    console.error('doOpenLocal error:', e);
  }
}

async function showCloneDialog(repoUrl = '', repoName = '') {
  const lastPath = await GetLastClonePath();
  openModal(`
    <div class="modal-header">Clone a repository</div>
    <div class="modal-body">
      <div class="field"><label>Repository URL</label>
        <input class="input" id="clone-url" placeholder="https://github.com/user/repo.git" value="${repoUrl}"></div>
      <div class="field"><label>Local path</label>
        <input class="input" id="clone-path" value="${repoName ? lastPath + '/' + repoName : lastPath}"></div>
      <div class="progress-bar" id="clone-progress"></div>
      <div id="clone-error" class="error-text"></div>
    </div>
    <div class="modal-footer">
      <button class="btn" id="clone-cancel">Cancel</button>
      <button class="btn primary" id="clone-ok">Clone</button>
    </div>`);
  $('#clone-cancel').onclick = closeModal;
  $('#clone-ok').onclick = doClone;
}

async function doClone() {
  const url = $('#clone-url')?.value?.trim();
  const path = $('#clone-path')?.value?.trim();
  if (!url) { $('#clone-error').textContent = 'URL is required'; return; }
  if (!path) { $('#clone-error').textContent = 'Path is required'; return; }
  const name = url.split('/').pop().replace('.git', '');
  const dest = `${path.replace(/\/$/, '')}/${name}`;
  const pb = $('#clone-progress');
  if (pb) pb.classList.add('visible');
  try {
    await CloneRepo(url, dest);
  } catch(e) {
    console.error('doClone error:', e);
  }
}

async function showCreateDialog() {
  const cfg = await GetConfig();
  const lastPath = cfg.last_create_path || '~';
  const templates = await GetGitIgnoreTemplates();
  crPathEdited = false;
  crBasePath = lastPath;

  openModal(`
    <div class="modal-header">Create a new repository</div>
    <div class="modal-body">
      <div class="field"><label>Name</label>
        <input class="input" id="cr-name" placeholder="repository-name"></div>
      <div class="field"><label>Description</label>
        <input class="input" id="cr-desc" placeholder="(optional)"></div>
      <div class="field"><label>Local path</label>
        <input class="input" id="cr-path" value="${lastPath}">
        <div class="modal-path-hint" id="cr-path-hint"></div>
        <div class="git-warn" id="cr-git-warn">This folder already has a git repository. Existing commits will be pushed.</div>
      </div>
      <div class="field"><label>Initial branch</label>
        <input class="input" id="cr-branch" value="main"></div>
      <div class="field"><label>Git ignore</label>
        <select class="input" id="cr-gitignore">
          ${(templates||[]).map(t => `<option>${t}</option>`).join('')}
        </select>
      </div>
      <div class="toggle-row">
        <label class="toggle"><input type="checkbox" id="cr-readme" checked><span class="toggle-slider"></span></label>
        Initialize with README
      </div>
      <div class="toggle-row">
        <label class="toggle"><input type="checkbox" id="cr-private"><span class="toggle-slider"></span></label>
        Keep this code private
      </div>
      <div id="cr-error" class="error-text"></div>
    </div>
    <div class="modal-footer">
      <button class="btn" id="cr-cancel">Cancel</button>
      <button class="btn primary" id="cr-ok">Create repository</button>
    </div>`);

  $('#cr-cancel').onclick = closeModal;
  $('#cr-ok').onclick = doCreate;
  $('#cr-name').oninput = updateCreatePath;
  $('#cr-path').oninput = () => { crPathEdited = true; crBasePath = $('#cr-path')?.value || ''; updateCreatePath(); };
}

let crPathEdited = false;
let crBasePath = '';

function updateCreatePath() {
  const nameEl = $('#cr-name');
  const pathEl = $('#cr-path');
  const hint = $('#cr-path-hint');
  if (!nameEl || !pathEl) return;
  const name = nameEl.value.trim();
  if (!crPathEdited) {
    pathEl.value = name ? `${crBasePath}/${name}` : crBasePath;
  }
  if (hint) hint.textContent = name && pathEl.value ? `Will be created at ${pathEl.value}` : '';
}

async function doCreate() {
  const name = $('#cr-name')?.value?.trim();
  const path = $('#cr-path')?.value?.trim();
  const desc = $('#cr-desc') ? $('#cr-desc').value.trim() : '';
  const isPrivate = $('#cr-private') ? $('#cr-private').checked : false;
  const withReadme = $('#cr-readme') ? $('#cr-readme').checked : true;
  const gitignore = $('#cr-gitignore') ? $('#cr-gitignore').value : 'None';
  const branch = $('#cr-branch') ? $('#cr-branch').value.trim() || 'main' : 'main';
  if (!name) { $('#cr-error').textContent = 'Name is required'; return; }
  if (!path) { $('#cr-error').textContent = 'Path is required'; return; }
  closeModal();
  crPathEdited = false;
  crBasePath = '';
  try {
    await CreateRepo(name, desc, isPrivate, withReadme, gitignore, branch, path);
  } catch(e) {
    console.error('doCreate error:', e);
  }
}

function showDeleteDialog() {
  const repo = state.currentRepo;
  openModal(`
    <div class="modal-header">Delete repository</div>
    <div class="modal-body">
      <div class="warn-box">${icon('warn')}
        <div>This will permanently delete <strong>${state.user}/${repo.name}</strong>.<br>This action cannot be undone.</div>
      </div>
      <div class="field">
        <label>Type the repository name to confirm:</label>
        <div class="copy-row">
          <input class="input" id="delete-confirm" placeholder="Type '${repo.name}' to confirm" style="border-color:var(--red)">
          <button class="btn" id="paste-btn" title="Paste name">${icon('copy')}</button>
        </div>
      </div>
      <div id="delete-error" class="error-text"></div>
    </div>
    <div class="modal-footer">
      <button class="btn" id="del-cancel">Cancel</button>
      <button class="btn danger" id="del-ok">Delete permanently</button>
    </div>`);
  $('#del-cancel').onclick = closeModal;
  $('#del-ok').onclick = doDelete;
  $('#paste-btn').onclick = () => { const inp = $('#delete-confirm'); if (inp) inp.value = state.currentRepo.name; };
}

async function doDelete() {
  const val = $('#delete-confirm')?.value?.trim();
  if (val !== state.currentRepo.name) {
    $('#delete-error').textContent = "Repository name doesn't match";
    return;
  }
  closeModal();

  const repoName = state.currentRepo.name;
  await StopWatcher();
  showScreen('main');

  renderRepoList(state.repos, false);

  const item = $(`.repo-item[data-name="${repoName}"]`);
  if (item) {
    item.classList.add('deleting');
    await new Promise(r => setTimeout(r, 850));
    item.style.transition = 'height 0.3s ease, margin 0.3s ease, padding 0.3s ease';
    const h = item.offsetHeight;
    item.style.height = h + 'px';
    item.offsetHeight;
    item.style.height = '0';
    item.style.margin = '0';
    item.style.paddingTop = '0';
    item.style.paddingBottom = '0';
    item.style.overflow = 'hidden';
    await new Promise(r => setTimeout(r, 300));
    item.remove();
  }

  state.repos = state.repos.filter(r => r.name !== repoName);
  updateRepoStatus();

  try {
    const res = await DeleteRepo(state.user, repoName);
    if (res.ok) {
      toast(`Deleted ${repoName}`);
    } else {
      toast(`${res.error}`, 'error');
    }
  } catch(e) {
    toast(`${e}`, 'error');
  }
}

function updateRepoStatus() {
  const status = $('#sidebar-status');
  if (status) status.textContent = `${state.repos.length} repositories`;
}

// ── INIT ───────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  EventsOn('onPushSuccess', () => {
    const btn = $('#push-btn');
    if (btn) { btn.innerHTML = `${icon('cloud')} Push origin`; btn.disabled = false; }
    toast('Pushed to GitHub');
    refreshBranch();
  });
  EventsOn('onPushError', (e) => {
    const btn = $('#push-btn');
    if (btn) { btn.innerHTML = `${icon('cloud')} Push origin`; btn.disabled = false; }
    toast(`Push failed: ${e}`, 'error');
  });
  EventsOn('onFetchSuccess', () => {
    const btn = $('#fetch-btn');
    if (btn) { btn.innerHTML = `${icon('cloud')} Fetch origin`; btn.disabled = false; }
    refreshBranch();
    toast('Fetched');
  });
  EventsOn('onFetchError', (e) => {
    const btn = $('#fetch-btn');
    if (btn) { btn.innerHTML = `${icon('cloud')} Fetch origin`; btn.disabled = false; }
    toast(`Fetch failed: ${e}`, 'error');
  });
  EventsOn('onFileChanged', () => { refreshChanges(); });
  EventsOn('onCloneSuccess', (dest) => { closeModal(); toast(`Cloned to ${dest}`); });
  EventsOn('onCloneError', (e) => { toast(`${e}`, 'error'); const pb = $('.progress-bar'); if(pb) pb.classList.remove('visible'); });
  EventsOn('onCreateRepoSuccess', async (name) => {
    toast(`${name} published to GitHub`);
    closeModal();
    showScreen('main');
    await loadRepos();
    const item = $(`.repo-item[data-name="${name}"]`);
    if (item) item.classList.add('adding');
  });
  EventsOn('onCreateRepoError', (e) => { toast(`${e}`, 'error'); });

  EventsOn('onUpdateProgress', (data) => {
    const progress = $('#update-progress');
    if (progress) progress.textContent = data.message;
  });
  EventsOn('onUpdateDone', () => {
    toast('Update installed! Restarting...');
  });
  EventsOn('onUpdateError', (e) => {
    toast(`Update failed: ${e}`, 'error');
    const btn = $('#update-install-btn');
    const progress = $('#update-progress');
    if (btn) { btn.disabled = false; btn.textContent = 'Install'; }
    if (progress) progress.textContent = 'Error: ' + e;
  });

  EventsOn('onOAuthSuccess', (res) => {
    if (res && res.ok) {
      state.user = res.user;
      state.avatarUrl = res.avatar_url || '';
      renderMain();
    } else {
      const errEl = $('#login-error');
      if (errEl) errEl.textContent = res?.error || 'OAuth failed';
      renderLogin();
    }
  });
  EventsOn('onOAuthError', (e) => {
    toast(`OAuth error: ${e}`, 'error');
    const errEl = $('#login-error');
    if (errEl) errEl.textContent = e;
    renderLogin();
  });

  // Init
  loadFontSize();
  try { state.theme = localStorage.getItem('gitdesktop-theme') || 'system'; } catch(e) {}
  applyTheme();

  $('#screen-login').innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;height:100vh;background:var(--bg)">
      <img src="${githubLogo}" style="width:80px;height:80px">
      <div style="color:var(--muted);font-size:13px">Loading...</div>
    </div>`;
  showScreen('login');

  try {
    const token = await GetSavedToken();
    if (token) {
      const res = await Login(token);
      if (res.ok) {
        state.user = res.user;
        state.avatarUrl = res.avatar_url || '';
        if (!state.avatarUrl) {
          const cfg = await GetConfig();
          state.avatarUrl = cfg.avatar_url || '';
        }
        renderMain();
        return;
      }
    }
  } catch(e) {
    console.error('Init error:', e);
  }
  renderLogin();
});

console.log('CACHE_BUST_2026_07_31_22_38');
