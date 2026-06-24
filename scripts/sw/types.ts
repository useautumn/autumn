/** Where a worktree's dev stack runs. */
export type Target = "local" | "exe" | "modal";

/** The worktree the CLI is acting on (its own cwd = the local checkout). */
export type WorktreeContext = {
	checkout: string;
	branch: string;
	slug: string;
};

/**
 * Contents of the `.herdr-remote` marker (TOML-ish KEY=value, parsed by both the
 * TS CLI and the POSIX wrapper shell — keep it flat and quote-free).
 */
export type RemoteMarker = {
	target: Exclude<Target, "local">;
	/** ssh target, e.g. `wt3.exe.xyz` (exe) — what the wrapper ssh's into. */
	host: string;
	/** Absolute worktree path on the box (wrapper does `cd <path>`). */
	path: string;
	/** Git branch the worktree tracks. */
	branch: string;
};

export type SwRegistryEntry = {
	/** Local checkout path (herdr's worktree dir on the Mac) — the registry key. */
	path: string;
	branch: string;
	slug: string;
	target: Target;
	createdAt: number;
	/** Remote-only fields. */
	host?: string;
	remotePath?: string;
	neonBranchId?: string;
	neonBranchName?: string;
	/** exe.dev VM name (for teardown). */
	vmName?: string;
};

export type SwRegistry = Record<string, SwRegistryEntry>;

/** Parsed `WorktreeInfo`/`WorkspaceInfo` from a herdr `worktree.created` event. */
export type WorktreeCreatedEvent = {
	data?: {
		worktree?: { checkout_path?: string; branch?: string; repo_name?: string };
		workspace?: { workspace_id?: string; active_tab_id?: string };
	};
};
