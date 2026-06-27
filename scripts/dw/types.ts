export type RegistryEntry = {
	path: string;
	worktreeNum: number;
	createdAt: number;
	/** Set when canonical checkout is provisioned on a feature git branch. */
	gitBranch?: string;
	branchId?: string;
	branchName?: string;
	databaseUrl?: string;
	lastUsedAt?: number;
	/** Public ngrok URL for this worktree's tunnel, refreshed each `bun dw setup`. */
	ngrokUrl?: string;
	/** ngrok reserved-domain id, so `bun dw teardown` can release it via the API. */
	reservedDomainId?: string;
	/** Neon project when provisioned outside the default Autumn project. */
	neonProjectId?: string;
	/** Neon region id (e.g. aws-us-west-2) for regional provisioning. */
	neonRegion?: string;
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
