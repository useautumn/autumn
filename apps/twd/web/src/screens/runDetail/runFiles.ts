import {
	isFailedFileStatus,
	type RunDetail,
	type RunFile,
} from "../../../../src/api/contract.ts";

export const TERMINAL = new Set(["passed", "failed", "cancelled", "errored"]);

export const isFailure = (f: RunFile) => isFailedFileStatus(f.status);

export const baseName = (file: string) => file.split("/").at(-1) ?? file;

/** Real workers are `<run>-w<n>`; the grid and lists show only the tail. */
export const shortWorker = (name: string) => name.split("-").at(-1) ?? name;

/** When each running file started: its worker's previous finish, else when the worker came up. */
export const runningSince = (run: RunDetail) => {
	const freeAt = new Map<string, number>();
	const bump = (worker: string | null | undefined, iso?: string | null) => {
		if (!worker || !iso) return;
		freeAt.set(worker, Math.max(freeAt.get(worker) ?? 0, Date.parse(iso)));
	};
	for (const w of run.workers) bump(w.name, w.readyAt);
	for (const f of run.files)
		if (f.status !== "running") bump(f.worker, f.finishedAt);
	const since = new Map<string, number>();
	for (const f of run.files) {
		const at = f.status === "running" && f.worker && freeAt.get(f.worker);
		if (at) since.set(f.file, at);
	}
	return since;
};
