/**
 * Provider seam for the `bun tw` cloud test swarm.
 *
 * The orchestrator (commands/run.ts) is ~80% provider-agnostic; the only backend
 * coupling is raw sandbox ops (create / fork / snapshot / delete / list / exec /
 * public-url). This module defines a small `ProviderImpl` interface over those
 * ops plus a provider-neutral `ProviderSandbox` handle, and exports delegating
 * functions the orchestrator calls. `setProvider(name)` picks the backend
 * (Vercel today, Modal via `--provider=modal`) — the backend module is
 * dynamically imported so the unused SDK never loads.
 *
 * Implementations: `helpers/vercel.ts` (`vercelProvider`) wraps `@vercel/sandbox`;
 * `helpers/modal.ts` (`modalProvider`) wraps the `modal` SDK.
 */

export type ProviderName = "vercel" | "modal" | "modalv2" | "freestyle";

/** Provider-neutral sandbox handle: the backend-native object + its name. */
export type ProviderSandbox = {
	/** Sandbox name (the registry/cleanup key). */
	name: string;
	/** Backend-native handle (Vercel `Sandbox` | Modal `Sandbox`) — opaque here. */
	handle: unknown;
	/**
	 * Backend-native sandbox id, when known. Recorded in the registry so teardown
	 * can reattach cross-process (Modal V2 has no name lookup — only `fromId`).
	 */
	id?: string;
	/** How a cached warm parent was served: exact sha image or stale `:latest`. */
	warmHit?: "exact" | "stale";
};

/** Git source cloned into a freshly-created sandbox (warm parent / ingress). */
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
	/** NAME of the warm source to fork/restore from. */
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
	/** Working directory for the detached command (the in-sandbox repo root). */
	cwd?: string;
	/** Combined stdout+stderr sink (scanned for the READY sentinel). */
	onChunk: (text: string) => void;
	env?: Record<string, string>;
	signal?: AbortSignal;
};

/** A long-lived (detached) command — the worker boot / ingress server. */
export type DetachedCommand = {
	/** Resolves with the command's exit code if/when it ends. */
	wait: (opts?: { signal?: AbortSignal }) => Promise<{ exitCode: number }>;
};

export type ListedSandbox = {
	name: string;
	status: string;
	createdAt: number;
	tags?: Record<string, string>;
};

/** The full surface a backend must implement. */
export type ProviderImpl = {
	createWarmSandbox(opts: CreateSandboxOptions): Promise<ProviderSandbox>;
	createIngressSandbox(opts: CreateSandboxOptions): Promise<ProviderSandbox>;
	forkWorker(opts: ForkWorkerOptions): Promise<ProviderSandbox>;
	snapshotAndStop(
		sandbox: ProviderSandbox,
		opts?: { signal?: AbortSignal },
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

/**
 * Select the backend. The backend module is dynamically imported so the unused
 * SDK (e.g. the `modal` package for a Vercel run) is never loaded.
 */
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

/** The currently-selected provider name (for logging / provider-keyed constants). */
export const providerName = (): ProviderName => {
	if (!active) {
		throw new Error("provider not selected — call setProvider() first");
	}
	return active;
};

/**
 * The in-sandbox repo root for the active backend. Vercel's SDK clones into
 * `/vercel/sandbox`; Modal clones into `/repo`. Lazily reads the selected
 * provider (so it must be called after `setProvider`). `TW_SANDBOX_REPO_ROOT`
 * overrides both, for local iteration.
 */
export const sandboxRepoRoot = (): string =>
	process.env.TW_SANDBOX_REPO_ROOT ??
	(providerName() === "vercel" ? "/vercel/sandbox" : "/repo");

const get = (): ProviderImpl => {
	if (!impl) {
		throw new Error("provider not selected — call setProvider() first");
	}
	return impl;
};

// ---- delegating exports (the orchestrator's stable call surface) ----------
export const createWarmSandbox = (o: CreateSandboxOptions) =>
	get().createWarmSandbox(o);
export const createIngressSandbox = (o: CreateSandboxOptions) =>
	get().createIngressSandbox(o);
export const forkWorker = (o: ForkWorkerOptions) => get().forkWorker(o);
export const snapshotAndStop = (
	s: ProviderSandbox,
	o?: { signal?: AbortSignal },
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
