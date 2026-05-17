export type RegistryEntry = {
	path: string;
	worktreeNum: number;
	createdAt: number;
	branchId?: string;
	branchName?: string;
	databaseUrl?: string;
	lastUsedAt?: number;
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
