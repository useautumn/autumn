export type ProviderName = "vercel" | "modal" | "modalv2" | "freestyle";

export type ProviderSandbox = {
	name: string;
	handle: unknown;
	id?: string;
	warmHit?: "exact" | "stale";
	checkoutMs?: number;
};

export type GitSource = {
	url: string;
	revision: string;
	username?: string;
	password?: string;
};

export type CreateSandboxOptions = {
	name: string;
	tags: Record<string, string>;
	env: Record<string, string>;
	source?: GitSource;
	ports?: number[];
	timeout?: number;
	vcpus?: number;
	signal?: AbortSignal;
};

export type ForkWorkerOptions = {
	sourceSandbox: string;
	name: string;
	env: Record<string, string>;
	tags: Record<string, string>;
	ports?: number[];
	timeout?: number;
	vcpus?: number;
	signal?: AbortSignal;
};

export type RunStreamingResult = {
	exitCode: number;
	stderr: string;
};

export type RunStreamingOptions = {
	env?: Record<string, string>;
	signal?: AbortSignal;
	swallowStreamClose?: boolean;
};

export type RunDetachedOptions = {
	cwd?: string;
	onChunk: (text: string) => void;
	env?: Record<string, string>;
	signal?: AbortSignal;
};

export type DetachedCommand = {
	wait: (opts?: { signal?: AbortSignal }) => Promise<{ exitCode: number }>;
};

export type ListedSandbox = {
	name: string;
	status: string;
	createdAt: number;
	tags?: Record<string, string>;
};

export type SnapshotAndStopOptions = {
	signal?: AbortSignal;
	shouldPublishLatest?: () => boolean;
};

export type ProviderImpl = {
	createWarmSandbox(opts: CreateSandboxOptions): Promise<ProviderSandbox>;
	createIngressSandbox(opts: CreateSandboxOptions): Promise<ProviderSandbox>;
	forkWorker(opts: ForkWorkerOptions): Promise<ProviderSandbox>;
	snapshotAndStop(
		sandbox: ProviderSandbox,
		opts?: SnapshotAndStopOptions,
	): Promise<string>;
	getPublicUrl(sandbox: ProviderSandbox, port: number): Promise<string>;
	getSandboxByName(name: string): Promise<ProviderSandbox | undefined>;
	deleteSandbox(
		sandboxOrName: ProviderSandbox | string,
		opts?: { signal?: AbortSignal },
	): Promise<void>;
	runStreaming(
		sandbox: ProviderSandbox,
		argv: string[],
		onChunk: (text: string) => void,
		opts?: RunStreamingOptions,
	): Promise<RunStreamingResult>;
	runDetached(
		sandbox: ProviderSandbox,
		argv: string[],
		opts: RunDetachedOptions,
	): Promise<DetachedCommand>;
	listSandboxesByOwner(
		owner: string,
		opts?: { signal?: AbortSignal },
	): Promise<ListedSandbox[]>;
	isSandboxStreamClosed(error: unknown): boolean;
};

let impl: ProviderImpl | undefined;
let active: ProviderName | undefined;

export const setProvider = async (name: ProviderName): Promise<void> => {
	if (name === "modalv2") {
		impl = (await import("./modal.ts")).modalV2Provider;
	} else if (name === "modal") {
		impl = (await import("./modal.ts")).modalProvider;
	} else if (name === "freestyle") {
		impl = (await import("./freestyle.ts")).freestyleProvider;
	} else {
		impl = (await import("./vercel.ts")).vercelProvider;
	}
	active = name;
};

export const providerName = (): ProviderName => {
	if (!active) {
		throw new Error("provider not selected — call setProvider() first");
	}
	return active;
};

export const sandboxRepoRoot = (): string =>
	process.env.TW_SANDBOX_REPO_ROOT ??
	(providerName() === "vercel" ? "/vercel/sandbox" : "/repo");

const get = (): ProviderImpl => {
	if (!impl) {
		throw new Error("provider not selected — call setProvider() first");
	}
	return impl;
};

export const createWarmSandbox = (o: CreateSandboxOptions) =>
	get().createWarmSandbox(o);
export const createIngressSandbox = (o: CreateSandboxOptions) =>
	get().createIngressSandbox(o);
export const forkWorker = (o: ForkWorkerOptions) => get().forkWorker(o);
export const snapshotAndStop = (
	s: ProviderSandbox,
	o?: SnapshotAndStopOptions,
) => get().snapshotAndStop(s, o);
export const getPublicUrl = (s: ProviderSandbox, port: number) =>
	get().getPublicUrl(s, port);
export const getSandboxByName = (name: string) => get().getSandboxByName(name);
export const deleteSandbox = (
	s: ProviderSandbox | string,
	o?: { signal?: AbortSignal },
) => get().deleteSandbox(s, o);
export const runStreaming = (
	s: ProviderSandbox,
	argv: string[],
	onChunk: (text: string) => void,
	o?: RunStreamingOptions,
) => get().runStreaming(s, argv, onChunk, o);
export const runDetached = (
	s: ProviderSandbox,
	argv: string[],
	o: RunDetachedOptions,
) => get().runDetached(s, argv, o);
export const listSandboxesByOwner = (
	owner: string,
	o?: { signal?: AbortSignal },
) => get().listSandboxesByOwner(owner, o);
export const isSandboxStreamClosed = (error: unknown) =>
	get().isSandboxStreamClosed(error);
