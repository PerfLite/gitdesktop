export namespace main {
	
	export class BranchInfoResult {
	    branch: string;
	    ahead: number;
	    behind: number;
	
	    static createFrom(source: any = {}) {
	        return new BranchInfoResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.branch = source["branch"];
	        this.ahead = source["ahead"];
	        this.behind = source["behind"];
	    }
	}
	export class ChangeInfo {
	    code: string;
	    path: string;
	    display: string;
	    is_dir: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ChangeInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.path = source["path"];
	        this.display = source["display"];
	        this.is_dir = source["is_dir"];
	    }
	}
	export class ChangesResult {
	    ok: boolean;
	    changes: ChangeInfo[];
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new ChangesResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.changes = this.convertValues(source["changes"], ChangeInfo);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CheckoutResult {
	    ok: boolean;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new CheckoutResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.error = source["error"];
	    }
	}
	export class CloneResult {
	    ok: boolean;
	    error?: string;
	    started?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new CloneResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.error = source["error"];
	        this.started = source["started"];
	    }
	}
	export class CommitDiffResult {
	    ok: boolean;
	    diff: string;
	
	    static createFrom(source: any = {}) {
	        return new CommitDiffResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.diff = source["diff"];
	    }
	}
	export class CommitInfo {
	    sha: string;
	    message: string;
	    author: string;
	    date: string;
	
	    static createFrom(source: any = {}) {
	        return new CommitInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sha = source["sha"];
	        this.message = source["message"];
	        this.author = source["author"];
	        this.date = source["date"];
	    }
	}
	export class CommitResult {
	    ok: boolean;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new CommitResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.error = source["error"];
	    }
	}
	export class CreateRepoResult {
	    ok: boolean;
	    error?: string;
	    started?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new CreateRepoResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.error = source["error"];
	        this.started = source["started"];
	    }
	}
	export class DeleteResult {
	    ok: boolean;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new DeleteResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.error = source["error"];
	    }
	}
	export class DiffResult {
	    ok: boolean;
	    diff: string;
	
	    static createFrom(source: any = {}) {
	        return new DiffResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.diff = source["diff"];
	    }
	}
	export class FetchResult {
	    ok: boolean;
	    error?: string;
	    started?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FetchResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.error = source["error"];
	        this.started = source["started"];
	    }
	}
	export class LoginResult {
	    ok: boolean;
	    user: string;
	    avatar_url: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new LoginResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.user = source["user"];
	        this.avatar_url = source["avatar_url"];
	        this.error = source["error"];
	    }
	}
	export class OpenRepoResult {
	    ok: boolean;
	    path: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new OpenRepoResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.path = source["path"];
	        this.error = source["error"];
	    }
	}
	export class PushResult {
	    ok: boolean;
	    error?: string;
	    started?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PushResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.error = source["error"];
	        this.started = source["started"];
	    }
	}
	export class ReposResult {
	    ok: boolean;
	    repos: any[];
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new ReposResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.repos = source["repos"];
	        this.error = source["error"];
	    }
	}
	export class UpdateInfo {
	    current_version: string;
	    latest_version: string;
	    update_available: boolean;
	    release_url: string;
	    release_notes: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.current_version = source["current_version"];
	        this.latest_version = source["latest_version"];
	        this.update_available = source["update_available"];
	        this.release_url = source["release_url"];
	        this.release_notes = source["release_notes"];
	        this.error = source["error"];
	    }
	}

}

