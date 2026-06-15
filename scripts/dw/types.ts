export type RegistryEntry = {
	path: string;
	worktreeNum: number;
	createdAt: number;
	branchId?: string;
	branchName?: string;
	databaseUrl?: string;
	lastUsedAt?: number;
	/** Public ngrok URL for this worktree's tunnel, refreshed each `bun dw setup`. */
	ngrokUrl?: string;
	/** ngrok reserved-domain id, so `bun dw teardown` can release it via the API. */
	reservedDomainId?: string;
};

export type Registry = Record<string, RegistryEntry>;

export type NeonBranch = {
	id: string;
	name: string;
	created_at?: string;
};

export type WorktreeAliases = {
	apiHost: string;
	apiUrl: string;
	viteHost: string;
	viteUrl: string;
};
