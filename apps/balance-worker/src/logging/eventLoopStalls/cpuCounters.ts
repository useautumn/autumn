import { readFileSync } from "node:fs";

export type CpuCounters = {
	processMicros: number;
	host: { stealTicks: number; iowaitTicks: number; totalTicks: number } | null;
	throttledMicros: number | null;
};

export type CpuWindow = {
	cpuMs: number;
	cpuPct: number;
	stealPct?: number;
	iowaitPct?: number;
	throttledMs?: number;
};

const PROC_STAT = "/proc/stat";
const CGROUP_V2_CPU_STAT = "/sys/fs/cgroup/cpu.stat";
const CGROUP_V1_CPU_STAT = "/sys/fs/cgroup/cpu/cpu.stat";
const HOST_TICK_FIELDS = 8;
const STEAL_FIELD = 7;
const IOWAIT_FIELD = 4;

function readCounterFile({ path }: { path: string }): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}

function hostTicksOf({ text }: { text: string | null }): CpuCounters["host"] {
	const line = text?.split("\n").find((row) => row.startsWith("cpu "));
	if (!line) return null;
	const ticks = line
		.trim()
		.split(/\s+/)
		.slice(1, 1 + HOST_TICK_FIELDS)
		.map(Number);
	if (ticks.length < HOST_TICK_FIELDS || !ticks.every(Number.isFinite))
		return null;
	return {
		stealTicks: ticks[STEAL_FIELD],
		iowaitTicks: ticks[IOWAIT_FIELD],
		totalTicks: ticks.reduce((sum, value) => sum + value, 0),
	};
}

function statOf({
	text,
	key,
}: {
	text: string | null;
	key: string;
}): number | null {
	const line = text?.split("\n").find((row) => row.startsWith(`${key} `));
	if (!line) return null;
	const value = Number(line.slice(key.length + 1).trim());
	return Number.isFinite(value) ? value : null;
}

function throttledMicrosOf({
	readFile,
}: {
	readFile: (params: { path: string }) => string | null;
}): number | null {
	const v2 = statOf({
		text: readFile({ path: CGROUP_V2_CPU_STAT }),
		key: "throttled_usec",
	});
	if (v2 !== null) return v2;
	const v1Nanos = statOf({
		text: readFile({ path: CGROUP_V1_CPU_STAT }),
		key: "throttled_time",
	});
	return v1Nanos === null ? null : v1Nanos / 1_000;
}

export function readCpuCounters({
	readFile = readCounterFile,
	processUsage = () => process.cpuUsage(),
}: {
	readFile?: (params: { path: string }) => string | null;
	processUsage?: () => { user: number; system: number };
} = {}): CpuCounters {
	const { user, system } = processUsage();
	return {
		processMicros: user + system,
		host: hostTicksOf({ text: readFile({ path: PROC_STAT }) }),
		throttledMicros: throttledMicrosOf({ readFile }),
	};
}

function percentOf({ part, whole }: { part: number; whole: number }): number {
	return Math.round((part / whole) * 10_000) / 100;
}

export function cpuWindowOf({
	previous,
	current,
	windowMs,
}: {
	previous: CpuCounters;
	current: CpuCounters;
	windowMs: number;
}): CpuWindow {
	const cpuMs =
		Math.round(current.processMicros - previous.processMicros) / 1_000;
	const window: CpuWindow = {
		cpuMs,
		cpuPct: windowMs > 0 ? percentOf({ part: cpuMs, whole: windowMs }) : 0,
	};
	const hostTicks =
		current.host && previous.host
			? current.host.totalTicks - previous.host.totalTicks
			: 0;
	if (current.host && previous.host && hostTicks > 0) {
		window.stealPct = percentOf({
			part: current.host.stealTicks - previous.host.stealTicks,
			whole: hostTicks,
		});
		window.iowaitPct = percentOf({
			part: current.host.iowaitTicks - previous.host.iowaitTicks,
			whole: hostTicks,
		});
	}
	if (current.throttledMicros !== null && previous.throttledMicros !== null)
		window.throttledMs =
			Math.round(current.throttledMicros - previous.throttledMicros) / 1_000;
	return window;
}
