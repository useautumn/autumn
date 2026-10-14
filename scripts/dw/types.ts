export type RegistryEntry = {
	path: string;
	worktreeNum: number;
	createdAt: number;
	gitBranch?: string;
	branchId?: string;
	branchName?: string;
	databaseUrl?: string;
	lastUsedAt?: number;
	publicUrl?: string;
	cloudflareTunnelId?: string;
	/** @deprecated leftover ngrok URL; read as fallback for publicUrl. */
	ngrokUrl?: string;
	ngrokViteUrl?: string;
	/** @deprecated leftover ngrok reserved-domain id; released on public-access ensure. */
	reservedDomainId?: string;
	reservedViteDomainId?: string;
	neonProjectId?: string;
	neonRegion?: string;
};

export type Registry = Record<string, RegistryEntry>;

export type NeonBranch = {
	id: string;
	name: string;
	created_at?: string;
	expires_at?: string;
};

export type WorktreeAliases = {
	apiHost: string;
	apiUrl: string;
	viteHost: string;
	viteUrl: string;
};
