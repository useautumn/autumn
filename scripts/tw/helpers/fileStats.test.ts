import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	type MachineSeconds,
	permitWaitP95,
	summariseFileStats,
} from "../worker/runTestFileWithStats.ts";
import {
	createFileStatsReader,
	type FileStats,
	fileStatsWrapperSource,
} from "./fileStats.ts";
import { buildTestArgv, withFileStatsWrapper } from "./remoteExecutor.ts";

const machine = (overrides: Partial<MachineSeconds>): MachineSeconds => ({
	untagged: [],
	untaggedWaitMs: [],
	untagged429: [],
	untaggedBusyMs: [],
	tagged: [],
	inFlight: [],
	rateLimited: [],
	alive: [],
	...overrides,
});

const baseInput = {
	firstSecond: 100,
	samples: [],
	wallMs: 2000,
	exitCode: 0,
	testCpuUsec: null,
	testMaxRssKib: null,
};

describe("summariseFileStats", () => {
	test("alone on a worker, every untagged request belongs to the file", () => {
		const stats = summariseFileStats({
			...baseInput,
			fileHash: {
				req_test: "3",
				req_server: "2",
				"s:100": "4",
				"s:101": "1",
				inflight_max: "2",
				busy_ms: "1000",
			},
			machine: machine({
				tagged: [4, 1],
				untagged: [0, 3],
				untaggedWaitMs: [0, 30],
				untagged429: [0, 1],
				untaggedBusyMs: [0, 600],
				inFlight: [2, 3],
				rateLimited: [0, 1],
				alive: [1, 1],
			}),
		});
		expect(stats.concurrentMax).toBe(1);
		expect(stats.stripe).toMatchObject({
			requests: 8,
			testRequests: 3,
			serverRequests: 2,
			apportionedRequests: 3,
			peakRps: 4,
			meanRps: 4,
			peakInFlight: 2,
			meanInFlight: 0.8,
			rateLimited: 1,
			permitWaitMs: 30,
			machinePeakRps: 4,
			machinePeakInFlight: 3,
			machineRateLimited: 1,
		});
	});

	test("with neighbours, untagged requests follow each file's share of tagged ones", () => {
		const stats = summariseFileStats({
			...baseInput,
			fileHash: { req_test: "1", "s:100": "1" },
			machine: machine({
				tagged: [4],
				untagged: [8],
				alive: [2],
			}),
		});
		expect(stats.concurrentMax).toBe(2);
		expect(stats.stripe?.apportionedRequests).toBe(2);
		expect(stats.stripe?.requests).toBe(3);
	});

	test("in a second with no tagged requests, untagged ones split evenly across live files", () => {
		const stats = summariseFileStats({
			...baseInput,
			fileHash: {},
			machine: machine({ tagged: [0], untagged: [9], alive: [3] }),
		});
		expect(stats.stripe?.apportionedRequests).toBe(3);
	});

	test("CPU is shared by live files; peak cores and memory are worker-wide", () => {
		const stats = summariseFileStats({
			...baseInput,
			firstSecond: 0,
			fileHash: null,
			machine: null,
			samples: [
				{ atMs: 0, cpuUsec: 0, memBytes: 1024 ** 3 },
				{ atMs: 1000, cpuUsec: 1_500_000, memBytes: 2 * 1024 ** 3 },
				{ atMs: 2000, cpuUsec: 2_000_000, memBytes: 1024 ** 3 },
			],
			testCpuUsec: 1_250_000,
			testMaxRssKib: 512 * 1024,
		});
		expect(stats.stripe).toBeNull();
		expect(stats.cpu).toEqual({
			coreSeconds: 2,
			peakCores: 1.5,
			testProcessSeconds: 1.25,
		});
		expect(stats.mem).toEqual({ peakMib: 2048, testProcessPeakMib: 512 });
	});
});

test("permit-wait p95 is the bucket bound covering 95% of requests", () => {
	expect(permitWaitP95({ histogram: {}, maxMs: 0 })).toBe(0);
	expect(permitWaitP95({ histogram: { "1": 95, "500": 5 }, maxMs: 400 })).toBe(
		1,
	);
	expect(permitWaitP95({ histogram: { "1": 90, "500": 10 }, maxMs: 400 })).toBe(
		400,
	);
	expect(permitWaitP95({ histogram: { "1": 1, inf: 99 }, maxMs: 12_000 })).toBe(
		12_000,
	);
});

test("the stats reader finds the line across chunk boundaries and ignores the rest", () => {
	const seen: FileStats[] = [];
	const reader = createFileStatsReader({
		onStats: (stats) => seen.push(stats),
	});
	const line = `[tw-file-stats] ${JSON.stringify({ v: 1, wallMs: 5 })}`;
	reader.push("(pass) a test\n[tw-file-stats] not json\n");
	reader.push(line.slice(0, 20));
	reader.push(`${line.slice(20)}\nmore`);
	reader.flush();
	expect(seen).toEqual([{ v: 1, wallMs: 5 } as FileStats]);
});

test("the wrapper keeps the test command and adds the file tag", () => {
	const argv = withFileStatsWrapper({
		argv: buildTestArgv("a.test.ts"),
		fileTag: "tag-1",
	});
	expect(argv.slice(0, 5)).toEqual([
		"env",
		"TEST_FILE_CONCURRENCY=4",
		"TW_TEST_FILE=tag-1",
		"bun",
		"-e",
	]);
	expect(argv.slice(6)).toEqual(buildTestArgv("a.test.ts").slice(2));
});

test("the inline wrapper passes output and exit code through, then prints its stats", async () => {
	const child = Bun.spawn(
		[
			"bun",
			"-e",
			fileStatsWrapperSource(),
			"bun",
			"-e",
			"console.log('(pass) x'); console.error('to stderr'); process.exit(3)",
		],
		{
			cwd: join(import.meta.dir, "../../.."),
			env: { ...process.env, TW_TEST_FILE: "tag-1", TW_STRIPE_REDIS_URL: "" },
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	expect(exitCode).toBe(3);
	expect(stdout).toContain("(pass) x");
	expect(stderr).toContain("to stderr");
	const seen: FileStats[] = [];
	const reader = createFileStatsReader({
		onStats: (stats) => seen.push(stats),
	});
	reader.push(stdout);
	reader.flush();
	expect(seen).toHaveLength(1);
	expect(seen[0]).toMatchObject({ v: 1, exitCode: 3, stripe: null });
	expect(seen[0]?.wallMs).toBeGreaterThan(0);
});
