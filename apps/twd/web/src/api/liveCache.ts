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
const RUNS_LIMIT = 100;

const upsert = <T>(list: T[], item: T, same: (a: T) => boolean) => {
	const i = list.findIndex(same);
	if (i === -1) return [item, ...list];
	const next = list.slice();
	next[i] = item;
	return next;
};

const count = (files: RunFile[], status: RunFile["status"]) =>
	files.filter((f) => f.status === status).length;

const matches = (run: RunSummary, filter: RunsFilter) =>
	(filter.status === "all" ||
		(filter.status === "live") === !TERMINAL.has(run.status)) &&
	(!filter.branch || run.branch.includes(filter.branch));

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

const forEachRunsQuery = (
	qc: QueryClient,
	fn: (filter: RunsFilter, list: RunSummary[]) => RunSummary[],
) => {
	for (const [key, list] of qc.getQueriesData<RunSummary[]>({
		queryKey: ["runs"],
	})) {
		if (!list) continue;
		qc.setQueryData(key, fn(key[1] as RunsFilter, list));
	}
};

const applySnapshot = (
	qc: QueryClient,
	topic: string,
	data: Extract<LiveServerMessage, { type: "snapshot" }>["data"],
) => {
	if (topic === "runs" && Array.isArray(data))
		return forEachRunsQuery(qc, (filter) =>
			(data as RunSummary[])
				.filter((r) => matches(r, filter))
				.sort(byNewest)
				.slice(0, RUNS_LIMIT),
		);
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
			forEachRunsQuery(qc, (filter, list) => {
				const rest = list.filter((r) => r.id !== run.id);
				return matches(run, filter)
					? [run, ...rest].sort(byNewest).slice(0, RUNS_LIMIT)
					: rest;
			});
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
