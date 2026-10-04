import { readdirSync, readFileSync } from "node:fs";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { GcTotals } from "./gcLogTotals.js";

/** Kernel clock ticks per second for /proc stat times; 100 on every Linux the worker runs on. */
const CLOCK_TICKS_PER_SECOND = 100;
const MS_PER_TICK = 1_000 / CLOCK_TICKS_PER_SECOND;
/** Event-loop delay sampling; the histogram is native, so only the timer wakes the loop. */
const LOOP_DELAY_RESOLUTION_MS = 10;

type ThreadTimes = { userMs: number; sysMs: number };

type Counters = {
	at: number;
	usage: NodeJS.ResourceUsage;
	threads: Map<string, ThreadTimes>;
	/** The JS thread's time on a CPU and waiting in the run queue for one (/proc/self/schedstat). */
	mainOnCpuNs: number | null;
	mainRunDelayNs: number | null;
	io: { syscr: number; syscw: number; rchar: number; wchar: number } | null;
	gc: GcTotals | null;
};

/** One reporting window of the whole process: where its CPU went and what held its thread. */
export type ProcessStatsWindow = {
	windowMs: number;
	/** getrusage(RUSAGE_SELF), every thread: user vs kernel CPU, and why threads left the CPU. */
	userCpuMs: number;
	sysCpuMs: number;
	voluntaryCtxSwitches: number;
	involuntaryCtxSwitches: number;
	minorPageFaults: number;
	majorPageFaults: number;
	/** CPU by thread name: `bun` is the JS thread, `HeapHelper` the GC's marking threads, `JITWorker` compilation. */
	threads: Record<string, { userMs: number; sysMs: number; count: number }>;
	/** The JS thread waiting for a CPU it was ready to use: steal, throttling or a busy host show up here. */
	mainRunQueueMs: number | null;
	mainOnCpuMs: number | null;
	/** Read and write syscalls the process made, and the bytes they moved. */
	syscr: number | null;
	syscw: number | null;
	rcharKb: number | null;
	wcharKb: number | null;
	/** From JSC's own GC log, aggregated by the launcher; null when it isn't logging. */
	gc: GcTotals | null;
	eventLoopDelayMs: { p50: number; p99: number; max: number } | null;
};

export type ProcessStats = {
	/** The window since the previous read; the first read covers the time since start. */
	readWindow(): ProcessStatsWindow;
	stop(): void;
};

function readText(path: string): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}

/** utime and stime are fields 14 and 15; the name in parentheses may hold spaces, so split after it. */
function threadTimesOf(stat: string): ThreadTimes | null {
	const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
	const utime = Number(fields[11]);
	const stime = Number(fields[12]);
	if (!Number.isFinite(utime) || !Number.isFinite(stime)) return null;
	return { userMs: utime * MS_PER_TICK, sysMs: stime * MS_PER_TICK };
}

/** Keyed by `name/tid`, so a thread is diffed against itself and an exited one drops out. */
function readThreads(): Map<string, ThreadTimes> {
	const threads = new Map<string, ThreadTimes>();
	let tids: string[];
	try {
		tids = readdirSync("/proc/self/task");
	} catch {
		return threads;
	}
	for (const tid of tids) {
		const name = readText(`/proc/self/task/${tid}/comm`)?.trim();
		const stat = readText(`/proc/self/task/${tid}/stat`);
		const times = stat ? threadTimesOf(stat) : null;
		if (name && times) threads.set(`${name}/${tid}`, times);
	}
	return threads;
}

function readIo(): Counters["io"] {
	const text = readText("/proc/self/io");
	if (!text) return null;
	const values: Record<string, number> = {};
	for (const line of text.split("\n")) {
		const [key, value] = line.split(":");
		if (key && value) values[key.trim()] = Number(value.trim());
	}
	const { syscr, syscw, rchar, wchar } = values;
	if (
		syscr === undefined ||
		syscw === undefined ||
		rchar === undefined ||
		wchar === undefined
	)
		return null;
	return { syscr, syscw, rchar, wchar };
}

function readMainSchedstat(): { onCpuNs: number; runDelayNs: number } | null {
	const text = readText(`/proc/self/task/${process.pid}/schedstat`);
	const [onCpu, runDelay] = text?.trim().split(" ").map(Number) ?? [];
	if (onCpu === undefined || runDelay === undefined) return null;
	if (!Number.isFinite(onCpu) || !Number.isFinite(runDelay)) return null;
	return { onCpuNs: onCpu, runDelayNs: runDelay };
}

function gcWindow({
	previous,
	current,
}: {
	previous: GcTotals | null;
	current: GcTotals | null;
}): ProcessStatsWindow["gc"] {
	if (!current) return null;
	const before = previous ?? {
		collections: 0,
		edenCollections: 0,
		fullCollections: 0,
		pauseMs: 0,
		maxPauseMs10s: 0,
		cycleMs: 0,
	};
	return {
		collections: current.collections - before.collections,
		edenCollections: current.edenCollections - before.edenCollections,
		fullCollections: current.fullCollections - before.fullCollections,
		pauseMs: round(current.pauseMs - before.pauseMs),
		maxPauseMs10s: round(current.maxPauseMs10s),
		cycleMs: round(current.cycleMs - before.cycleMs),
	};
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

function threadsWindow({
	previous,
	current,
}: {
	previous: Map<string, ThreadTimes>;
	current: Map<string, ThreadTimes>;
}): ProcessStatsWindow["threads"] {
	const byName: ProcessStatsWindow["threads"] = {};
	for (const [key, times] of current) {
		const name = key.slice(0, key.lastIndexOf("/"));
		const before = previous.get(key) ?? { userMs: 0, sysMs: 0 };
		const entry = byName[name] ?? { userMs: 0, sysMs: 0, count: 0 };
		entry.userMs = round(entry.userMs + times.userMs - before.userMs);
		entry.sysMs = round(entry.sysMs + times.sysMs - before.sysMs);
		entry.count += 1;
		byName[name] = entry;
	}
	return byName;
}

function nullableDelta(
	current: number | null | undefined,
	previous: number | null | undefined,
	scale = 1,
): number | null {
	if (current === null || current === undefined) return null;
	if (previous === null || previous === undefined) return null;
	return round((current - previous) / scale);
}

/**
 * Where the process's CPU went between health reports: user vs kernel, per thread (JS, GC, JIT), run-queue
 * wait, syscalls and event-loop delay. Every source is a counter the kernel or runtime already keeps.
 */
export function createProcessStats({
	gcTotalsPath,
}: {
	/** Where the launcher writes JSC's GC totals; absent, windows carry no GC. */
	gcTotalsPath?: string;
} = {}): ProcessStats {
	const loopDelay = monitorEventLoopDelay({
		resolution: LOOP_DELAY_RESOLUTION_MS,
	});
	loopDelay.enable();

	function readGc(): GcTotals | null {
		if (!gcTotalsPath) return null;
		const text = readText(gcTotalsPath);
		if (!text) return null;
		try {
			return JSON.parse(text) as GcTotals;
		} catch {
			return null;
		}
	}

	function read(): Counters {
		const schedstat = readMainSchedstat();
		return {
			at: performance.now(),
			usage: process.resourceUsage(),
			threads: readThreads(),
			mainOnCpuNs: schedstat?.onCpuNs ?? null,
			mainRunDelayNs: schedstat?.runDelayNs ?? null,
			io: readIo(),
			gc: readGc(),
		};
	}

	let previous = read();

	function readWindow(): ProcessStatsWindow {
		const current = read();
		const { usage } = current;
		const before = previous.usage;
		const window: ProcessStatsWindow = {
			windowMs: Math.round(current.at - previous.at),
			userCpuMs: round((usage.userCPUTime - before.userCPUTime) / 1_000),
			sysCpuMs: round((usage.systemCPUTime - before.systemCPUTime) / 1_000),
			voluntaryCtxSwitches:
				usage.voluntaryContextSwitches - before.voluntaryContextSwitches,
			involuntaryCtxSwitches:
				usage.involuntaryContextSwitches - before.involuntaryContextSwitches,
			minorPageFaults: usage.minorPageFault - before.minorPageFault,
			majorPageFaults: usage.majorPageFault - before.majorPageFault,
			threads: threadsWindow({
				previous: previous.threads,
				current: current.threads,
			}),
			mainRunQueueMs: nullableDelta(
				current.mainRunDelayNs,
				previous.mainRunDelayNs,
				1_000_000,
			),
			mainOnCpuMs: nullableDelta(
				current.mainOnCpuNs,
				previous.mainOnCpuNs,
				1_000_000,
			),
			syscr: nullableDelta(current.io?.syscr, previous.io?.syscr),
			syscw: nullableDelta(current.io?.syscw, previous.io?.syscw),
			rcharKb: nullableDelta(current.io?.rchar, previous.io?.rchar, 1_024),
			wcharKb: nullableDelta(current.io?.wchar, previous.io?.wchar, 1_024),
			gc: gcWindow({ previous: previous.gc, current: current.gc }),
			eventLoopDelayMs:
				loopDelay.count > 0
					? {
							p50: round(loopDelay.percentile(50) / 1_000_000),
							p99: round(loopDelay.percentile(99) / 1_000_000),
							max: round(loopDelay.max / 1_000_000),
						}
					: null,
		};
		loopDelay.reset();
		previous = current;
		return window;
	}

	function stop(): void {
		loopDelay.disable();
	}

	return { readWindow, stop };
}
