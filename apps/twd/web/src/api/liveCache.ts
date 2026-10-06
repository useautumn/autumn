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
	(!filter.purpose || run.purpose === filter.purpose) &&
	(!filter.branch ||
		run.branch.toLowerCase().includes(filter.branch.toLowerCase()));

const byNewest = (a: RunSummary, b: RunSummary) =>
	Date.parse(b.createdAt) - Date.parse(a.createdAt);

/** Folds a batch of events into one new RunDetail: O(events + workers + files), one render. */
const applyRunEvents = (run: RunDetail, events: RunEvent[]): RunDetail => {
	let { status, phase, finishedAt, milestones } = run;
	const workers = new Map(run.workers.map((w) => [w.name, w]));
	const files = new Map(run.files.map((f) => [f.file, f]));
	let touchedFiles = false;
	for (const event of events) {
		if (event.type === "status") {
			status = event.status;
			phase = event.phase;
			milestones = event.milestones ?? milestones;
			if (TERMINAL.has(status) && !finishedAt)
				finishedAt = new Date().toISOString();
		} else if (event.type === "worker") {
			workers.set(event.worker.name, event.worker);
		} else if (event.type === "file") {
			files.set(event.file.file, event.file);
			touchedFiles = true;
		}
	}
	const fileList = touchedFiles ? [...files.values()] : run.files;
	return {
		...run,
		status,
		phase,
		finishedAt,
		milestones,
		workers: [...workers.values()],
		files: fileList,
		...(touchedFiles && {
			passed: count(fileList, "passed"),
			failed: count(fileList, "failed") + count(fileList, "crashed"),
		}),
	};
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

type RunBatch = { events: RunEvent[]; lines: LogLine[] };
const runBatches = new Map<string, RunBatch>();
const FLUSH_MS = 150;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushQc: QueryClient | undefined;

const queueRunEvent = (runId: string, event: RunEvent) => {
	let batch = runBatches.get(runId);
	if (!batch) {
		batch = { events: [], lines: [] };
		runBatches.set(runId, batch);
	}
	if (event.type === "log")
		batch.lines.push({
			file: event.file,
			worker: event.worker,
			text: event.text,
		});
	else batch.events.push(event);
	flushTimer ??= setTimeout(flushRunBatches, FLUSH_MS);
};

/** Busy runs emit thousands of events a second; applying them per frame-ish batch keeps the UI current. */
const flushRunBatches = () => {
	flushTimer = undefined;
	const qc = flushQc;
	if (!qc) return;
	for (const [runId, { events, lines }] of runBatches) {
		if (lines.length) {
			qc.setQueryData<LogLine[]>(qk.liveLog(runId), (prev = []) =>
				[...prev, ...lines].slice(-MAX_LOG_LINES),
			);
			const byFile = new Map<string, string[]>();
			for (const line of lines)
				if (line.file)
					byFile.set(line.file, [...(byFile.get(line.file) ?? []), line.text]);
			for (const [file, texts] of byFile)
				qc.setQueryData<string>(qk.fileLog(runId, file), (log) =>
					log === undefined ? log : `${log}\n${texts.join("\n")}`,
				);
		}
		if (events.length) {
			qc.setQueryData<RunDetail>(qk.run(runId), (run) =>
				run ? applyRunEvents(run, events) : run,
			);
			const settled = new Set(
				events.flatMap((e) => (e.type === "file" ? [e.file.file] : [])),
			);
			for (const file of settled)
				qc.invalidateQueries({
					queryKey: qk.fileLog(runId, file),
					refetchType: "active",
				});
		}
	}
	runBatches.clear();
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
		case "run.event":
			queueRunEvent(event.runId, event.event);
			return;
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
			qc.invalidateQueries({ queryKey: qk.keys });
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
		flushQc = qc;
		if (msg.type === "snapshot") {
			flushRunBatches();
			applySnapshot(qc, msg.topic, msg.data);
		}
		if (msg.type === "event") applyEvent(qc, msg.event);
		if (msg.type === "error")
			console.warn("twd live:", msg.error.code, msg.error.message);
	});
