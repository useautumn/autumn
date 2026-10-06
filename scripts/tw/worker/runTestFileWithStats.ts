/**
 * Runs one `bun test` command on a tw worker and, after it exits, prints one
 * `[tw-file-stats] {json}` line: Stripe load from the worker's Redis counters
 * (twStripeFileStats.lua), CPU and memory, for that file attempt.
 *
 * Shipped as `bun -e` source by the orchestrator, so it works on any sha and uses built-ins only.
 * Attribution: requests tagged with this file's TW_TEST_FILE are exact; untagged server
 * work (webhooks, queues) is split per second by each live file's share of tagged requests,
 * or evenly between live files when none were tagged. With one file per worker that is exact.
 */
import { existsSync, readFileSync } from "node:fs";
import { constants } from "node:os";

export const FILE_STATS_MARKER = "[tw-file-stats]";
const STATS_LUA =
	"server/src/external/connect/clientCache/twStripeLimiter/twStripeFileStats.lua";
/** Upper bounds (ms) of the permit-wait histogram; matches recordTwStripeFileStats.ts. */
const WAIT_BUCKETS_MS = [1, 10, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
const ALIVE_TICK_MS = 500;
const SAMPLE_TICK_MS = 1000;
const REDIS_DEADLINE_MS = 5000;
const KEY_TTL_S = "7200";

export type ResourceSample = {
	atMs: number;
	cpuUsec: number | null;
	memBytes: number | null;
};

export type MachineSeconds = {
	/** Untagged requests, their permit wait (ms) and 429s. */
	untagged: number[];
	untaggedWaitMs: number[];
	untagged429: number[];
	/** Tagged requests from every file on the worker. */
	tagged: number[];
	/** Worker-wide peak in-flight and 429s. */
	inFlight: number[];
	rateLimited: number[];
	/** Files alive on the worker (at least this one). */
	alive: number[];
};

export type FileStats = {
	v: 1;
	wallMs: number;
	exitCode: number;
	/** Peak files running at once on this worker during this file. */
	concurrentMax: number;
	stripe: {
		requests: number;
		testRequests: number;
		serverRequests: number;
		/** Untagged worker requests apportioned to this file (part of requests). */
		apportionedRequests: number;
		peakRps: number;
		meanRps: number;
		peakInFlight: number;
		rateLimited: number;
		rateLimitedReasons: Record<string, number>;
		permitWaitMs: number;
		permitWaitMaxMs: number;
		permitWaitP95Ms: number;
		machinePeakRps: number;
		machinePeakInFlight: number;
		machineRateLimited: number;
	} | null;
	cpu: {
		/** Worker CPU in this file's window, shared evenly with concurrent files. */
		coreSeconds: number | null;
		/** Worker-wide peak over 1 s samples; shared when concurrentMax > 1. */
		peakCores: number | null;
		testProcessSeconds: number | null;
	};
	mem: {
		/** Worker-wide peak used memory; shared when concurrentMax > 1. */
		peakMib: number | null;
		testProcessPeakMib: number | null;
	};
};

const round = (value: number, digits = 2) =>
	Math.round(value * 10 ** digits) / 10 ** digits;

const readCpuUsec = (): number | null => {
	try {
		const stat = readFileSync("/sys/fs/cgroup/cpu.stat", "utf8");
		const usage = /^usage_usec (\d+)/m.exec(stat)?.[1];
		if (usage) return Number(usage);
	} catch {}
	try {
		const [, ...fields] = readFileSync("/proc/stat", "utf8")
			.split("\n", 1)[0]
			.trim()
			.split(/\s+/)
			.map(Number);
		// user nice system idle iowait irq softirq steal; USER_HZ is 100 on Linux.
		const busy = fields
			.slice(0, 8)
			.reduce(
				(sum, value, index) => (index === 3 || index === 4 ? sum : sum + value),
				0,
			);
		return busy * 10_000;
	} catch {
		return null;
	}
};

const readMemBytes = (): number | null => {
	try {
		return Number(readFileSync("/sys/fs/cgroup/memory.current", "utf8").trim());
	} catch {}
	try {
		const info = readFileSync("/proc/meminfo", "utf8");
		const total = /^MemTotal:\s+(\d+)/m.exec(info)?.[1];
		const available = /^MemAvailable:\s+(\d+)/m.exec(info)?.[1];
		return total && available
			? (Number(total) - Number(available)) * 1024
			: null;
	} catch {
		return null;
	}
};

export const sampleResources = (): ResourceSample => ({
	atMs: Date.now(),
	cpuUsec: readCpuUsec(),
	memBytes: readMemBytes(),
});

/** Bucket upper bound at or above the 95th percentile; the observed max when it falls past the last bucket. */
export const permitWaitP95 = ({
	histogram,
	maxMs,
}: {
	histogram: Record<string, number>;
	maxMs: number;
}) => {
	const total = Object.values(histogram).reduce((sum, n) => sum + n, 0);
	if (total === 0) return 0;
	let seen = 0;
	for (const bound of WAIT_BUCKETS_MS) {
		seen += histogram[String(bound)] ?? 0;
		if (seen >= total * 0.95) return Math.min(bound, maxMs);
	}
	return maxMs;
};

/** Pure: turns raw counters for the file's window [firstSecond, firstSecond + n) into its stats. */
export const summariseFileStats = ({
	fileHash,
	machine,
	firstSecond,
	samples,
	wallMs,
	exitCode,
	testCpuUsec,
	testMaxRssKib,
}: {
	fileHash: Record<string, string> | null;
	machine: MachineSeconds | null;
	firstSecond: number;
	samples: ResourceSample[];
	wallMs: number;
	exitCode: number;
	testCpuUsec: number | null;
	testMaxRssKib: number | null;
}): FileStats => {
	const alive = (index: number) => Math.max(1, machine?.alive[index] ?? 1);
	const aliveAt = (atMs: number) =>
		alive(Math.floor(atMs / 1000) - firstSecond);

	let coreSeconds: number | null = null;
	let peakCores: number | null = null;
	for (let i = 1; i < samples.length; i++) {
		const [prev, next] = [samples[i - 1], samples[i]];
		if (prev.cpuUsec === null || next.cpuUsec === null) continue;
		const usedSeconds = Math.max(0, next.cpuUsec - prev.cpuUsec) / 1e6;
		const elapsedSeconds = (next.atMs - prev.atMs) / 1000;
		coreSeconds = (coreSeconds ?? 0) + usedSeconds / aliveAt(next.atMs);
		if (elapsedSeconds >= 0.5)
			peakCores = Math.max(peakCores ?? 0, usedSeconds / elapsedSeconds);
	}
	const memValues = samples
		.map((sample) => sample.memBytes)
		.filter((value): value is number => value !== null);

	const cpu = {
		coreSeconds: coreSeconds === null ? null : round(coreSeconds),
		peakCores: peakCores === null ? null : round(peakCores),
		testProcessSeconds: testCpuUsec === null ? null : round(testCpuUsec / 1e6),
	};
	const mem = {
		peakMib:
			memValues.length > 0 ? round(Math.max(...memValues) / 2 ** 20, 0) : null,
		testProcessPeakMib:
			testMaxRssKib === null ? null : round(testMaxRssKib / 1024, 0),
	};
	const seconds = machine?.alive.length ?? 0;
	const concurrentMax = Math.max(1, ...(machine?.alive ?? [1]));
	if (!fileHash || !machine)
		return { v: 1, wallMs, exitCode, concurrentMax, stripe: null, cpu, mem };

	const field = (name: string) => Number(fileHash[name] ?? 0);
	let apportioned = 0;
	let apportionedWaitMs = 0;
	let apportioned429 = 0;
	let peakRps = 0;
	let machinePeakRps = 0;
	for (let i = 0; i < seconds; i++) {
		const own = field(`s:${firstSecond + i}`);
		const tagged = machine.tagged[i] ?? 0;
		const share = tagged > 0 ? own / tagged : 1 / alive(i);
		const untagged = machine.untagged[i] ?? 0;
		apportioned += untagged * share;
		apportionedWaitMs += (machine.untaggedWaitMs[i] ?? 0) * share;
		apportioned429 += (machine.untagged429[i] ?? 0) * share;
		peakRps = Math.max(peakRps, own + untagged * share);
		machinePeakRps = Math.max(machinePeakRps, tagged + untagged);
	}
	const testRequests = field("req_test");
	const serverRequests = field("req_server");
	const requests = testRequests + serverRequests + apportioned;
	const histogram: Record<string, number> = {};
	const rateLimitedReasons: Record<string, number> = {};
	for (const [name, value] of Object.entries(fileHash)) {
		if (name.startsWith("h:")) histogram[name.slice(2)] = Number(value);
		if (name.startsWith("rl:"))
			rateLimitedReasons[name.slice(3)] = Number(value);
	}
	const waitMax = field("wait_max");
	return {
		v: 1,
		wallMs,
		exitCode,
		concurrentMax,
		stripe: {
			requests: round(requests),
			testRequests,
			serverRequests,
			apportionedRequests: round(apportioned),
			peakRps: round(peakRps),
			meanRps: round(wallMs > 0 ? requests / (wallMs / 1000) : 0),
			peakInFlight: field("inflight_max"),
			rateLimited: round(field("r429") + apportioned429),
			rateLimitedReasons,
			permitWaitMs: round(field("wait_sum") + apportionedWaitMs, 0),
			permitWaitMaxMs: waitMax,
			permitWaitP95Ms: permitWaitP95({ histogram, maxMs: waitMax }),
			machinePeakRps,
			machinePeakInFlight: Math.max(0, ...machine.inFlight),
			machineRateLimited: machine.rateLimited.reduce((sum, n) => sum + n, 0),
		},
		cpu,
		mem,
	};
};

/** A plain function: `bun -e` parses as TSX, where `<T>(` would open a JSX tag. */
function withDeadline<T>(promise: Promise<T>): Promise<T> {
	return Promise.race([
		promise,
		new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error("redis deadline")), REDIS_DEADLINE_MS),
		),
	]);
}

const readStripeCounters = async ({
	redis,
	fileTag,
	firstSecond,
	lastSecond,
}: {
	redis: InstanceType<typeof Bun.RedisClient>;
	fileTag: string;
	firstSecond: number;
	lastSecond: number;
}) => {
	const window = Array.from(
		{ length: lastSecond - firstSecond + 1 },
		(_, i) => firstSecond + i,
	);
	const machineFields = (prefix: string) => window.map((s) => `${prefix}:${s}`);
	const prefixes = ["u", "uw", "ur", "a", "i", "r"];
	const [fileHash, machineValues, alive] = await withDeadline(
		Promise.all([
			redis.send("HGETALL", [`tw:fs:file:${fileTag}`]) as Promise<Record<
				string,
				string
			> | null>,
			redis.send("HMGET", [
				"tw:fs:machine",
				...prefixes.flatMap(machineFields),
			]) as Promise<(string | null)[]>,
			Promise.all(
				window.map((s) => redis.send("SCARD", [`tw:fs:alive:${s}`])),
			) as Promise<number[]>,
		]),
	);
	const column = (index: number) =>
		machineValues
			.slice(index * window.length, (index + 1) * window.length)
			.map((value) => Number(value ?? 0));
	const machine: MachineSeconds = {
		untagged: column(0),
		untaggedWaitMs: column(1),
		untagged429: column(2),
		tagged: column(3),
		inFlight: column(4),
		rateLimited: column(5),
		alive: alive.map(Number),
	};
	return { fileHash: fileHash ?? {}, machine };
};

const main = async () => {
	const argv = process.argv.slice(1);
	const fileTag = process.env.TW_TEST_FILE;
	const redisUrl = process.env.TW_STRIPE_REDIS_URL;
	const tracksStripe = Boolean(fileTag && redisUrl && existsSync(STATS_LUA));
	const redis = tracksStripe && redisUrl ? new Bun.RedisClient(redisUrl) : null;
	const markAlive = () => {
		if (!redis || !fileTag) return;
		const key = `tw:fs:alive:${Math.floor(Date.now() / 1000)}`;
		void redis
			.send("SADD", [key, fileTag])
			.then(() => redis.send("EXPIRE", [key, KEY_TTL_S]))
			.catch(() => {});
	};

	const startedAt = Date.now();
	const samples = [sampleResources()];
	markAlive();
	const aliveTimer = setInterval(markAlive, ALIVE_TICK_MS);
	const sampleTimer = setInterval(
		() => samples.push(sampleResources()),
		SAMPLE_TICK_MS,
	);
	const child = Bun.spawn(argv, { stdio: ["inherit", "inherit", "inherit"] });
	for (const signal of ["SIGTERM", "SIGINT"] as const)
		process.on(signal, () => child.kill(signal));
	await child.exited;
	clearInterval(aliveTimer);
	clearInterval(sampleTimer);
	samples.push(sampleResources());
	const endedAt = Date.now();
	const exitCode =
		child.exitCode ??
		128 + (child.signalCode ? constants.signals[child.signalCode] : 0);
	const usage = child.resourceUsage();

	const firstSecond = Math.floor(startedAt / 1000);
	let counters: Awaited<ReturnType<typeof readStripeCounters>> | null = null;
	if (redis && fileTag) {
		counters = await readStripeCounters({
			redis,
			fileTag,
			firstSecond,
			lastSecond: Math.floor(endedAt / 1000),
		}).catch(() => null);
		redis.close();
	}
	const stats = summariseFileStats({
		fileHash: counters?.fileHash ?? null,
		machine: counters?.machine ?? null,
		firstSecond,
		samples,
		wallMs: endedAt - startedAt,
		exitCode,
		testCpuUsec: usage ? Number(usage.cpuTime.total) : null,
		testMaxRssKib: usage ? Number(usage.maxRSS) : null,
	});
	process.stdout.write(`\n${FILE_STATS_MARKER} ${JSON.stringify(stats)}\n`);
	process.exit(exitCode);
};

if (import.meta.main) await main();
