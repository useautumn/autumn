import { profile } from "bun:jsc";
import { readdirSync, readFileSync } from "node:fs";
import { servedTotals } from "../init/processStats.js";
import { subjectReadCounts } from "../state/openSqliteStore.js";

type Frame = {
	name: string;
	sourceURL?: string;
	line: number;
	category: string;
};
type Trace = { frames: Frame[] };

const MAX_SECONDS = 30;
const TOP = 40;
const CLOCK_TICKS_PER_SECOND = 100;

/** CPU ms of the calling thread alone: the share of `coresByThread` this thread's own work used. */
const callingThreadCpuMs = (): number => {
	const { user, system } = process.threadCpuUsage();
	return (user + system) / 1000;
};

/** Each of this process's threads (JS, GC helpers, JIT compilers, I/O) with its CPU seconds so far, by thread name. */
const readThreadCpu = (): Map<string, number> => {
	const byName = new Map<string, number>();
	for (const tid of readdirSync("/proc/self/task")) {
		try {
			const stat = readFileSync(`/proc/self/task/${tid}/stat`, "utf8");
			const name = stat.slice(stat.indexOf("(") + 1, stat.lastIndexOf(")"));
			const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
			const seconds =
				(Number(fields[11]) + Number(fields[12])) / CLOCK_TICKS_PER_SECOND;
			byName.set(name, (byName.get(name) ?? 0) + seconds);
		} catch {
			// A thread that exited between the listing and the read.
		}
	}
	return byName;
};

const shortFile = (url: string | undefined): string =>
	url
		? url.replace(/^.*\/node_modules\//, "").replace(/^.*\/autumn\//, "")
		: "";

const frameKey = (frame: Frame): string =>
	frame.sourceURL
		? `${frame.name || "(anonymous)"} ${shortFile(frame.sourceURL)}:${frame.line}`
		: `${frame.name || "(runtime)"} [native]`;

const topOf = (counts: Map<string, number>, samples: number) =>
	[...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, TOP)
		.map(([fn, n]) => ({ fn, pct: Math.round((n / samples) * 1000) / 10 }));

/** Self time by the innermost frame; a native frame is named with the first JS function that called it. */
const summarize = (traces: Trace[]) => {
	const self = new Map<string, number>();
	const selfByCaller = new Map<string, number>();
	const inclusive = new Map<string, number>();
	const tiers = new Map<string, number>();
	let busy = 0;
	for (const { frames } of traces) {
		const top = frames[0];
		if (!top || top.name === "profile") continue;
		busy += 1;
		self.set(frameKey(top), (self.get(frameKey(top)) ?? 0) + 1);
		const firstJs = frames.find((frame) => frame.sourceURL);
		const callerKey = top.sourceURL
			? frameKey(top)
			: `${top.name || "(runtime)"} ← ${firstJs ? frameKey(firstJs) : "no JS caller"}`;
		selfByCaller.set(callerKey, (selfByCaller.get(callerKey) ?? 0) + 1);
		if (firstJs)
			tiers.set(firstJs.category, (tiers.get(firstJs.category) ?? 0) + 1);
		for (const key of new Set(frames.filter((f) => f.sourceURL).map(frameKey)))
			inclusive.set(key, (inclusive.get(key) ?? 0) + 1);
	}
	return {
		busySamples: busy,
		selfTop: topOf(self, busy),
		selfByCallerTop: topOf(selfByCaller, busy),
		inclusiveTop: topOf(inclusive, busy),
		jitTierOfFirstJsFrame: Object.fromEntries(tiers),
	};
};

let profiling = false;

/** Samples this process's JS thread for a few seconds while it keeps serving, with every thread's CPU over the same window. */
export const profileProcess = async ({
	seconds,
	intervalMicros,
}: {
	seconds: number;
	intervalMicros: number;
}) => {
	if (profiling) return { error: "a profile is already running here" };
	profiling = true;
	try {
		const windowSeconds = Math.min(Math.max(seconds, 1), MAX_SECONDS);
		const threadsBefore = readThreadCpu();
		const servedBefore = { ...servedTotals };
		const readsBefore = subjectReadCounts.reads;
		const cpuBefore = callingThreadCpuMs();
		const startedAt = performance.now();
		const result = await profile(
			() => Bun.sleep(windowSeconds * 1000),
			Math.max(intervalMicros, 100),
		);
		const elapsedSeconds = (performance.now() - startedAt) / 1000;
		const threadCpuMs = callingThreadCpuMs() - cpuBefore;
		const threadsAfter = readThreadCpu();
		const threadCpu = Object.fromEntries(
			[...threadsAfter.entries()]
				.map(
					([name, cpu]) =>
						[
							name,
							Math.round(
								((cpu - (threadsBefore.get(name) ?? 0)) / elapsedSeconds) *
									1000,
							) / 1000,
						] as const,
				)
				.filter(([, cores]) => cores > 0)
				.sort((a, b) => b[1] - a[1]),
		);
		const traces = (result.stackTraces as unknown as { traces: Trace[] })
			.traces;
		return {
			pid: process.pid,
			arch: process.arch,
			elapsedSeconds,
			intervalMicros,
			/** Checks and pushes this thread took in, and the subject reads it made as owner, over the window. */
			served: {
				checks: servedTotals.checks - servedBefore.checks,
				pushes: servedTotals.pushes - servedBefore.pushes,
				ownedReads: subjectReadCounts.reads - readsBefore,
			},
			threadCpuCores:
				Math.round((threadCpuMs / 1000 / elapsedSeconds) * 1000) / 1000,
			coresByThread: threadCpu,
			memory: process.memoryUsage(),
			...summarize(traces),
		};
	} finally {
		profiling = false;
	}
};
