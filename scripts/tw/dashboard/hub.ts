/**
 * Dashboard data hub for the `bun tw` web UI (apps/testbench).
 *
 * The opentui TUI store (`tui/store.ts`) holds the metadata the terminal renders
 * (phase, progress, per-file pass/fail, summary). The web dashboard needs MORE:
 *   - the raw TEST stdout of each file (per-file view),
 *   - the SERVER stdout of each worker + which files it ran (per-worker view),
 *   - completion timestamps (live speed graph).
 *
 * This module captures those extras (fed by the swarm hooks) and exposes a tiny
 * event emitter so the WebSocket server can STREAM output chunks to subscribed
 * browsers instead of re-sending whole buffers. Pure data — no UI, no transport.
 * It's a no-op unless the dashboard is enabled (the swarm only feeds it then).
 */

/** Cap per-stream buffers so a long run can't grow memory unbounded. */
const MAX_BUFFER_CHARS = 256_000;

export type WorkerStatus = "booting" | "ready" | "dead";

export type HubEvent =
	| { type: "fileOutput"; file: string; chunk: string }
	| { type: "workerOutput"; worker: string; chunk: string }
	| { type: "fileWorker"; file: string; worker: string }
	| { type: "workerStatus"; worker: string; status: WorkerStatus }
	| { type: "completion"; file: string; at: number }
	| { type: "errorsOutput"; chunk: string };

type Listener = (event: HubEvent) => void;

const listeners = new Set<Listener>();
/** Raw per-file TEST output (capped). */
const fileOutputs = new Map<string, string>();
/** Raw per-worker SERVER output (capped). */
const workerOutputs = new Map<string, string>();
/** Which worker ran each file. */
const fileWorker = new Map<string, string>();
/** Files each worker has run (insertion order). */
const workerFiles = new Map<string, string[]>();
/** Worker boot status. */
const workerStatus = new Map<string, WorkerStatus>();
/** Epoch-ms timestamps of file completions (for the speed graph). */
const completions: number[] = [];
/** Dispatch time per file (latest attempt) — durations for the timings view. */
const fileStarts = new Map<string, number>();
/** Wall duration of each file's LAST completed attempt. */
const fileDurations = new Map<string, number>();
/** Rolling failure feed: every failed file's failure detail, appended live. */
let errorsBuffer = "";
/** Files the dashboard asked to skip (honored while still pending). */
const skipRequests = new Set<string>();

let enabled = false;

/** Turn capture on (the swarm only feeds the hub when the dashboard is up). */
export const enableHub = (): void => {
	enabled = true;
};
export const isHubEnabled = (): boolean => enabled;

const append = (map: Map<string, string>, key: string, chunk: string): void => {
	const next = (map.get(key) ?? "") + chunk;
	map.set(
		key,
		next.length > MAX_BUFFER_CHARS
			? next.slice(next.length - MAX_BUFFER_CHARS)
			: next,
	);
};

const emit = (event: HubEvent): void => {
	for (const listener of listeners) {
		listener(event);
	}
};

/** Subscribe to streaming events; returns an unsubscribe fn. */
export const onHubEvent = (listener: Listener): (() => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};

// ---- mutators (called by the swarm capture hooks) -------------------------

export const setFileWorker = (file: string, worker: string): void => {
	if (!enabled) {
		return;
	}
	fileWorker.set(file, worker);
	fileStarts.set(file, Date.now());
	const files = workerFiles.get(worker) ?? [];
	if (!files.includes(file)) {
		files.push(file);
		workerFiles.set(worker, files);
	}
	emit({ type: "fileWorker", file, worker });
};

export const appendFileOutput = (file: string, chunk: string): void => {
	if (!enabled) {
		return;
	}
	append(fileOutputs, file, chunk);
	emit({ type: "fileOutput", file, chunk });
};

export const appendWorkerOutput = (worker: string, chunk: string): void => {
	if (!enabled) {
		return;
	}
	append(workerOutputs, worker, chunk);
	emit({ type: "workerOutput", worker, chunk });
};

export const setWorkerStatus = (worker: string, status: WorkerStatus): void => {
	if (!enabled) {
		return;
	}
	workerStatus.set(worker, status);
	emit({ type: "workerStatus", worker, status });
};

export const recordCompletion = (file: string): void => {
	if (!enabled) {
		return;
	}
	const at = Date.now();
	completions.push(at);
	const startedAt = fileStarts.get(file);
	if (startedAt) {
		fileDurations.set(file, at - startedAt);
	}
	emit({ type: "completion", file, at });
};

/** Append one failed file's failure detail to the live errors feed. */
export const appendErrorsOutput = (chunk: string): void => {
	if (!enabled) {
		return;
	}
	errorsBuffer =
		errorsBuffer.length + chunk.length > MAX_BUFFER_CHARS * 4
			? errorsBuffer.slice(chunk.length) + chunk
			: errorsBuffer + chunk;
	emit({ type: "errorsOutput", chunk });
};

export const requestSkip = (file: string): void => {
	skipRequests.add(file);
};
export const isSkipRequested = (file: string): boolean =>
	skipRequests.has(file);

// ---- readers (used by the WebSocket server) -------------------------------

export const getFileOutput = (file: string): string =>
	fileOutputs.get(file) ?? "";
export const getWorkerOutput = (worker: string): string =>
	workerOutputs.get(worker) ?? "";
export const getWorkerOf = (file: string): string | undefined =>
	fileWorker.get(file);
export const getCompletions = (): number[] => completions;
export const getErrorsOutput = (): string => errorsBuffer;
export const getDurationMs = (file: string): number | undefined =>
	fileDurations.get(file);

/** Worker list with status + the files each ran (for the per-worker view). */
export const getWorkers = (): {
	name: string;
	status: WorkerStatus;
	files: string[];
}[] =>
	Array.from(workerFiles.keys())
		.concat(Array.from(workerStatus.keys()))
		.filter((name, i, arr) => arr.indexOf(name) === i)
		.map((name) => ({
			name,
			status: workerStatus.get(name) ?? "booting",
			files: workerFiles.get(name) ?? [],
		}));

/** Reset between runs (the module is a process-singleton). */
export const resetHub = (): void => {
	fileOutputs.clear();
	workerOutputs.clear();
	fileWorker.clear();
	workerFiles.clear();
	workerStatus.clear();
	completions.length = 0;
	fileStarts.clear();
	fileDurations.clear();
	errorsBuffer = "";
	skipRequests.clear();
};
