import type { QueryClient } from "@tanstack/react-query";
import type {
	Branch,
	Capacity,
	Job,
	KeysOverview,
	LiveEvent,
	LiveServerMessage,
	RunDetail,
	RunEvent,
	RunFile,
	RunSummary,
	RunsPage,
} from "../../../src/api/contract.ts";
import { qk, type RunsFilter } from "./hooks.ts";
import { liveSocket } from "./live.ts";

export type LogLine = {
	file: string | null;
	worker: string | null;
	text: string;
};

const TERMINAL = new Set(["passed", "failed", "cancelled", "errored"]);
const MAX_LOG_LINES = 400;

const upsert = <T>(list: T[], item: T, same: (a: T) => boolean) => {
	const i = list.findIndex(same);
	if (i === -1) return [item, ...list];
	const next = list.slice();
	next[i] = item;
	return next;
};

const count = (files: RunFile[], status: RunFile["status"]) =>
	files.filter((f) => f.status === status).length;

const OUTCOMES: Record<string, string[]> = {
	passed: ["passed"],
	failed: ["failed", "errored"],
	cancelled: ["cancelled"],
};

const matches = (run: RunSummary, filter: RunsFilter) =>
	(filter.status === "all" ||
		(filter.status === "live") === !TERMINAL.has(run.status)) &&
	(!filter.outcome ||
		filter.outcome === "all" ||
		!!OUTCOMES[filter.outcome]?.includes(run.status)) &&
	(!filter.branch ||
		run.branch.toLowerCase().includes(filter.branch.toLowerCase()));

const byNewest = (a: RunSummary, b: RunSummary) =>
	Date.parse(b.createdAt) - Date.parse(a.createdAt);

const applyRunEvent = (run: RunDetail, event: RunEvent): RunDetail => {
	switch (event.type) {
		case "status":
			return {
				...run,
				status: event.status,
				phase: event.phase,
				finishedAt:
					TERMINAL.has(event.status) && !run.finishedAt
						? new Date().toISOString()
						: run.finishedAt,
			};
		case "worker": {
			const known = run.workers.some((w) => w.name === event.worker.name);
			return {
				...run,
				workers: known
					? run.workers.map((w) =>
							w.name === event.worker.name ? event.worker : w,
						)
					: [...run.workers, event.worker],
			};
		}
		case "file": {
			const files = upsert(
				run.files,
				event.file,
				(f) => f.file === event.file.file,
			);
			return {
				...run,
				files,
				passed: count(files, "passed"),
				failed: count(files, "failed") + count(files, "crashed"),
			};
		}
		case "log":
			return run;
	}
};

/** Live-patches cached run pages: in-place updates everywhere; entries and exits only on first pages. */
const patchRunPages = (qc: QueryClient, run: RunSummary) => {
	for (const [key, page] of qc.getQueriesData<RunsPage>({
		queryKey: ["runs"],
	})) {
		if (!page) continue;
		const filter = key[1] as RunsFilter;
		const present = page.runs.some((r) => r.id === run.id);
		const fits = matches(run, filter);
		if (filter.cursor) {
			if (present && fits)
				qc.setQueryData<RunsPage>(key, {
					...page,
					runs: page.runs.map((r) => (r.id === run.id ? run : r)),
				});
			else if (present) qc.invalidateQueries({ queryKey: key });
			continue;
		}
		const rest = page.runs.filter((r) => r.id !== run.id);
		const runs = fits ? [run, ...rest].sort(byNewest) : rest;
		qc.setQueryData<RunsPage>(key, {
			runs: runs.slice(0, filter.limit),
			nextCursor: page.nextCursor,
			total:
				page.total + (fits && !present ? 1 : 0) - (!fits && present ? 1 : 0),
		});
	}
};

const applySnapshot = (
	qc: QueryClient,
	topic: string,
	data: Extract<LiveServerMessage, { type: "snapshot" }>["data"],
) => {
	if (topic === "runs") return qc.invalidateQueries({ queryKey: ["runs"] });
	if (topic.startsWith("run:") && data)
		return qc.setQueryData(qk.run(topic.slice(4)), data as RunDetail);
	if (topic === "jobs" && Array.isArray(data))
		return qc.setQueryData(qk.jobs, data as Job[]);
	if (topic === "capacity" && data)
		return qc.setQueryData(qk.capacity, data as Capacity);
	if (topic === "keys") return qc.invalidateQueries({ queryKey: qk.keys });
	if (topic === "accounts")
		return qc.invalidateQueries({ queryKey: qk.accounts });
	if (topic === "warm") return qc.invalidateQueries({ queryKey: qk.branches });
};

const applyEvent = (qc: QueryClient, event: LiveEvent) => {
	switch (event.type) {
		case "run.updated": {
			const { run } = event;
			patchRunPages(qc, run);
			qc.setQueryData<RunDetail>(qk.run(run.id), (detail) =>
				detail ? { ...detail, ...run } : detail,
			);
			return;
		}
		case "run.event": {
			const { runId, event: e } = event;
			if (e.type === "log") {
				qc.setQueryData<LogLine[]>(qk.liveLog(runId), (prev = []) => [
					...prev.slice(-(MAX_LOG_LINES - 1)),
					{ file: e.file, worker: e.worker, text: e.text },
				]);
				if (e.file)
					qc.setQueryData<string>(qk.fileLog(runId, e.file), (log) =>
						log === undefined ? log : `${log}\n${e.text}`,
					);
				return;
			}
			qc.setQueryData<RunDetail>(qk.run(runId), (run) =>
				run ? applyRunEvent(run, e) : run,
			);
			if (e.type === "file")
				qc.invalidateQueries({
					queryKey: qk.fileLog(runId, e.file.file),
					refetchType: "active",
				});
			return;
		}
		case "job.updated":
			qc.setQueryData<Job[]>(qk.jobs, (jobs) =>
				jobs ? upsert(jobs, event.job, (j) => j.id === event.job.id) : jobs,
			);
			return;
		case "capacity.updated":
			qc.setQueryData(qk.capacity, event.capacity);
			qc.setQueryData<KeysOverview>(qk.keys, (keys) =>
				keys && keys.gate.state !== event.capacity.gate
					? { ...keys, gate: { ...keys.gate, state: event.capacity.gate } }
					: keys,
			);
			return;
		case "keys.changed":
			qc.invalidateQueries({ queryKey: qk.keys });
			return;
		case "accounts.changed":
			qc.invalidateQueries({ queryKey: qk.accounts });
			return;
		case "warm.updated":
			qc.setQueryData<Branch[]>(qk.branches, (branches) =>
				branches?.map((b) =>
					b.name === event.branch || b.sha === event.sha
						? { ...b, warm: event.status }
						: b,
				),
			);
			return;
	}
};

/** Routes every socket message into the react-query cache. Call once. */
export const connectLiveCache = (qc: QueryClient) =>
	liveSocket.listen((msg) => {
		if (msg.type === "snapshot") applySnapshot(qc, msg.topic, msg.data);
		if (msg.type === "event") applyEvent(qc, msg.event);
		if (msg.type === "error")
			console.warn("twd live:", msg.error.code, msg.error.message);
	});
