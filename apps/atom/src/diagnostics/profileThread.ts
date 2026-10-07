import { profile } from "bun:jsc";
import { threadId } from "./threadId.js";

type Frame = {
	name: string;
	sourceURL?: string;
	line: number;
	category: string;
};
type Trace = { frames: Frame[] };

const TOP = 15;

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
		.map(([fn, n]) => ({
			fn,
			pct: Math.round((n / Math.max(samples, 1)) * 1000) / 10,
		}));

const bump = (map: Map<string, number>, key: string) =>
	map.set(key, (map.get(key) ?? 0) + 1);

/** Self time by innermost frame (a native frame named with its first JS caller), inclusive JS time, and idle samples. */
const summarize = (traces: Trace[]) => {
	const selfByCaller = new Map<string, number>();
	const inclusive = new Map<string, number>();
	let busy = 0;
	for (const { frames } of traces) {
		const top = frames[0];
		if (!top || top.name === "profile") continue;
		busy += 1;
		const firstJs = frames.find((frame) => frame.sourceURL);
		bump(
			selfByCaller,
			top.sourceURL
				? frameKey(top)
				: `${top.name || "(runtime)"} ← ${firstJs ? frameKey(firstJs) : "no JS caller"}`,
		);
		for (const key of new Set(frames.filter((f) => f.sourceURL).map(frameKey)))
			bump(inclusive, key);
	}
	return {
		samples: traces.length,
		busySamples: busy,
		selfByCallerTop: topOf(selfByCaller, busy),
		inclusiveTop: topOf(inclusive, busy),
	};
};

/** Samples the calling thread with JSC for a window while it keeps serving; CPU is this thread's own over the window. */
export const profileThread = async ({
	seconds,
	intervalMicros,
}: {
	seconds: number;
	intervalMicros: number;
}) => {
	const before = process.threadCpuUsage();
	const startedAt = performance.now();
	const startedAtIso = new Date().toISOString();
	const result = await profile(() => Bun.sleep(seconds * 1000), intervalMicros);
	const elapsedSeconds = (performance.now() - startedAt) / 1000;
	const cpu = process.threadCpuUsage(before);
	return {
		tid: threadId(),
		startedAt: startedAtIso,
		elapsedSeconds: Math.round(elapsedSeconds * 100) / 100,
		userCores: Math.round((cpu.user / 1e6 / elapsedSeconds) * 1000) / 1000,
		systemCores: Math.round((cpu.system / 1e6 / elapsedSeconds) * 1000) / 1000,
		...summarize((result.stackTraces as unknown as { traces: Trace[] }).traces),
	};
};
