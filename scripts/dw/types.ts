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
	/** Public Cloudflare origin, e.g. https://autumn-wt45-a1b2c3.autumnworktree.com */
	publicUrl?: string;
	cloudflareTunnelId?: string;
	/** @deprecated leftover ngrok URL; read as fallback for publicUrl. */
	ngrokUrl?: string;
	ngrokViteUrl?: string;
	/** @deprecated leftover ngrok reserved-domain id; released on public-access ensure. */
	reservedDomainId?: string;
	reservedViteDomainId?: string;
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
