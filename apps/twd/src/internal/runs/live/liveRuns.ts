import type { RunEvent, RunFile, WorkerState } from "../../../api/contract.ts";
import type { RunStatus } from "../../../db/schema/runs.ts";
import { publishLive } from "../../live/liveHub/liveHub.ts";
import type { RunEta } from "../eta/estimateRunEta.ts";

/** Per-file output kept in memory while a run is live in this process. */
const FILE_LOG_MAX_CHARS = 64_000;
/** Keep a finished run in memory a while so late SSE/log readers hit it. */
const FINISHED_RETENTION_MS = 10 * 60 * 1000;

export type LiveRun = {
	status: RunStatus;
	phase: string | null;
	workers: Map<string, WorkerState>;
	files: Map<string, RunFile>;
	fileLogs: Map<string, string>;
	eta: RunEta | null;
	listeners: Set<(event: RunEvent) => void>;
	/** Set by the swarm job; aborts the child from POST /runs/:id/cancel. */
	cancel?: () => void;
};

const liveRuns = new Map<string, LiveRun>();

export const openLiveRun = ({
	runId,
	status,
	cancel,
}: {
	runId: string;
	status: RunStatus;
	cancel: () => void;
}): LiveRun => {
	const run: LiveRun = liveRuns.get(runId) ?? {
		status,
		phase: null,
		workers: new Map(),
		files: new Map(),
		fileLogs: new Map(),
		eta: null,
		listeners: new Set(),
	};
	run.cancel = cancel;
	liveRuns.set(runId, run);
	return run;
};

export const getLiveRun = ({ runId }: { runId: string }) => liveRuns.get(runId);

/** Apply an event to the live snapshot, then fan it out to SSE subscribers. */
export const publishRunEvent = ({
	runId,
	event,
}: {
	runId: string;
	event: RunEvent;
}) => {
	const run = liveRuns.get(runId);
	if (!run) return;
	if (event.type === "status") {
		run.status = event.status;
		run.phase = event.phase;
	} else if (event.type === "worker") {
		run.workers.set(event.worker.name, event.worker);
	} else if (event.type === "file") {
		run.files.set(event.file.file, event.file);
	} else if (event.type === "eta") {
		run.eta =
			event.etaMs === null || event.etaP90Ms === null
				? null
				: { etaMs: event.etaMs, etaP90Ms: event.etaP90Ms };
	} else if (event.file) {
		const next = (run.fileLogs.get(event.file) ?? "") + event.text;
		run.fileLogs.set(event.file, next.slice(-FILE_LOG_MAX_CHARS));
	}
	for (const listener of run.listeners) listener(event);
	publishLive({
		topic: `run:${runId}`,
		event: { type: "run.event", runId, event },
	});
};

export const subscribeRunEvents = ({
	runId,
	listener,
}: {
	runId: string;
	listener: (event: RunEvent) => void;
}) => {
	const run = liveRuns.get(runId);
	run?.listeners.add(listener);
	return () => {
		run?.listeners.delete(listener);
	};
};

export const retireLiveRun = ({ runId }: { runId: string }) => {
	const run = liveRuns.get(runId);
	if (run) run.cancel = undefined;
	setTimeout(() => liveRuns.delete(runId), FINISHED_RETENTION_MS).unref();
};
