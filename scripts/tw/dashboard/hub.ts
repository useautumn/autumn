const MAX_BUFFER_CHARS = 256_000;

export type WorkerStatus =
	| "provisioning"
	| "booting"
	| "ready"
	| "dead"
	| "failed";

export type HubEvent =
	| { type: "fileOutput"; file: string; chunk: string }
	| { type: "workerOutput"; worker: string; chunk: string }
	| { type: "fileWorker"; file: string; worker: string }
	| { type: "workerStatus"; worker: string; status: WorkerStatus; reason?: string }
	| { type: "completion"; file: string; at: number }
	| { type: "errorsOutput"; chunk: string };

type Listener = (event: HubEvent) => void;

const listeners = new Set<Listener>();
const fileOutputs = new Map<string, string>();
const workerOutputs = new Map<string, string>();
const fileWorker = new Map<string, string>();
const workerFiles = new Map<string, string[]>();
const workerStatus = new Map<string, WorkerStatus>();
const workerReason = new Map<string, string>();
const completions: number[] = [];
const fileStarts = new Map<string, number>();
let runStartedAt: number | null = null;
const fileDurations = new Map<string, number>();
let errorsBuffer = "";
const skipRequests = new Set<string>();

let enabled = false;

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

export const onHubEvent = (listener: Listener): (() => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};

export const setFileWorker = (file: string, worker: string): void => {
	if (!enabled) {
		return;
	}
	fileWorker.set(file, worker);
	runStartedAt ??= Date.now();
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

export const setWorkerStatus = (
	worker: string,
	status: WorkerStatus,
	reason?: string,
): void => {
	if (!enabled) {
		return;
	}
	workerStatus.set(worker, status);
	if (reason) {
		workerReason.set(worker, reason);
	}
	emit({ type: "workerStatus", worker, status, reason });
};

export const registerExpectedWorkers = (names: string[]): void => {
	if (!enabled) {
		return;
	}
	for (const name of names) {
		workerStatus.set(name, "provisioning");
		emit({ type: "workerStatus", worker: name, status: "provisioning" });
	}
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
export const getRunStartedAt = (): number | null => runStartedAt;

export const getWorkers = (): {
	name: string;
	status: WorkerStatus;
	files: string[];
	reason?: string;
}[] =>
	Array.from(workerStatus.keys())
		.concat(Array.from(workerFiles.keys()))
		.filter((name, i, arr) => arr.indexOf(name) === i)
		.map((name) => ({
			name,
			status: workerStatus.get(name) ?? "booting",
			files: workerFiles.get(name) ?? [],
			reason: workerReason.get(name),
		}));

export const resetHub = (): void => {
	fileOutputs.clear();
	workerOutputs.clear();
	fileWorker.clear();
	workerFiles.clear();
	workerStatus.clear();
	workerReason.clear();
	completions.length = 0;
	fileStarts.clear();
	runStartedAt = null;
	fileDurations.clear();
	errorsBuffer = "";
	skipRequests.clear();
};
