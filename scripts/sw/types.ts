/** Where a worktree's dev stack runs. */
export type Target = "local" | "exe" | "modal";

/** The worktree the CLI is acting on (its own cwd = the local checkout). */
export type WorktreeContext = {
	checkout: string;
	branch: string;
	slug: string;
};

/** Contents of the `.herdr-remote` marker — the box the wrapper shell ssh's into. */
export type RemoteMarker = {
	host: string;
	path: string;
};

export type SwRegistryEntry = {
	/** Local checkout path (the worktree on the Mac) — the registry key. */
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
