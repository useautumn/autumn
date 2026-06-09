export type SandboxFile = {
	path: string;
	content: string;
};

export type SandboxRunArgs = {
	command: string;
	files: SandboxFile[];
	returnFiles: string[];
	timeoutMs: number;
};

export type SandboxRunResult = {
	stdout: string;
	stderr: string;
	exitCode?: number;
	timedOut: boolean;
	files: SandboxFile[];
};

export type SandboxSessionContext = {
	channelId: string;
	env: string;
	orgId: string;
	provider: string;
	threadId: string;
	workspaceId: string;
};

export type SandboxProvider = {
	run(args: SandboxRunArgs): Promise<SandboxRunResult>;
};
