import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const queryAtomLogsModulePath =
	"@/internal/byoc/actions/telemetry/atomLogs/queryAtomLogs";
const realQueryAtomLogs = { ...(await import(queryAtomLogsModulePath)) };

type Query = { startTime: string; pipeline: string };
const queries: Query[] = [];
let periodRows: Record<string, unknown>[] = [];
let latestRows: Record<string, unknown>[] = [];
let volumeRows: Record<string, unknown>[] = [];

mock.module(queryAtomLogsModulePath, () => ({
	queryAtomLogs: async (query: Query) => {
		queries.push(query);
		if (query.startTime === "now-1m") return latestRows;
		if (query.startTime === "now-5m") return volumeRows;
		return periodRows;
	},
}));

const { atomMetricsPeriodSeconds, queryAtomMetrics } = await import(
	"@/internal/byoc/actions/telemetry/atomLogs/queryAtomMetrics"
);

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const RANGE_SECONDS = { "1h": 3600, "24h": 86_400, "7d": 604_800 };
const createdDaysAgo = (days: number) => Date.now() - days * DAY_MS;

afterAll(() => {
	mock.module(queryAtomLogsModulePath, () => realQueryAtomLogs);
});

beforeEach(() => {
	queries.length = 0;
	periodRows = [];
	latestRows = [];
	volumeRows = [];
});

const GIB = 1024 ** 3;

describe("an Atom's metrics", () => {
	test("rate each period's average over the seconds it covers, and its maximum as its busiest window", async () => {
		periodRows = [
			{
				_time: "2026-10-09T14:30:00Z",
				cpu: 0.25,
				memory: 0.5,
				requests: 26,
				forwarded: 1,
				pushes: 26,
				seconds: 130,
				requestsPerSecond: 1.9,
				forwardedPerSecond: 0.1,
				pushesPerSecond: 1.9,
				disk: 0.42,
				evicted: 312,
			},
			{ requests: 26, seconds: 130 },
		];
		latestRows = [
			{
				_time: "2026-10-09T14:31:10Z",
				requests: 42,
				forwarded: 6,
				pushes: 12,
				seconds: 60,
			},
		];

		const metrics = await queryAtomMetrics({
			deploymentId: "dep_123",
			range: "24h",
			createdAt: createdDaysAgo(30),
		});

		expect(queries.map((query) => query.startTime)).toEqual([
			"now-24h",
			"now-1m",
			"now-5m",
		]);
		expect(queries[0].pipeline).toMatch(
			/arg_max\(.*\)\s+by bin\(_time, 900s\)/,
		);
		expect(metrics).toEqual({
			period_seconds: 900,
			points: [
				{
					at: Date.parse("2026-10-09T14:30:00Z"),
					cpu: 0.25,
					memory: 0.5,
					disk: 0.42,
					evicted: 312,
					maximum: { requests: 1.9, forwarded: 0.1, pushes: 1.9 },
					average: { requests: 0.2, forwarded: 1 / 130, pushes: 0.2 },
				},
			],
			latest: {
				at: Date.parse("2026-10-09T14:31:10Z"),
				requests: 0.7,
				forwarded: 0.1,
				pushes: 0.2,
			},
			volumes: [],
		});
	});

	test("chart the fullest replica's disk at its fullest and sum the replicas' evictions", async () => {
		await queryAtomMetrics({
			deploymentId: "dep_123",
			range: "24h",
			createdAt: createdDaysAgo(30),
		});

		expect(queries[0].pipeline).toMatch(
			/disk = max\(diskShare\),\s+evicted = sum\(todouble\(data\.interval\.diskEvicted\)\)\s+by bin\(_time, 10s\)/,
		);
		expect(queries[0].pipeline).toMatch(
			/disk = max\(disk\),\s+evicted = sum\(evicted\),[\s\S]*by bin\(_time, 900s\)/,
		);
		expect(queries[0].pipeline).not.toContain("diskExpired");
	});

	test("leave disk unknown, not empty, for a period no replica reported its volume in", async () => {
		periodRows = [
			{ _time: "2026-10-09T14:30:00Z", disk: null, seconds: 900 },
			{ _time: "2026-10-09T14:45:00Z", seconds: 900 },
		];

		const metrics = await queryAtomMetrics({
			deploymentId: "dep_123",
			range: "24h",
			createdAt: createdDaysAgo(30),
		});

		expect(queries[0].pipeline).toContain(
			"iff(diskTotalBytes > 0, (diskTotalBytes - todouble(data.disk.availBytes)) / diskTotalBytes, real(null))",
		);
		expect(
			metrics.points.map(({ disk, evicted }) => ({ disk, evicted })),
		).toEqual([
			{ disk: null, evicted: 0 },
			{ disk: null, evicted: 0 },
		]);
	});

	test("list each replica's last reported volume fullest first, dropping one that couldn't read it", async () => {
		volumeRows = [
			{
				replicaId: "replica_a",
				_time: "2026-10-09T14:31:00Z",
				totalBytes: 20 * GIB,
				availBytes: 15 * GIB,
				usedBytes: 5 * GIB,
			},
			{
				replicaId: "replica_b",
				_time: "2026-10-09T14:31:05Z",
				totalBytes: 50 * GIB,
				availBytes: 10 * GIB,
				usedBytes: 40 * GIB,
			},
			{
				replicaId: "replica_c",
				_time: "2026-10-09T14:31:02Z",
				totalBytes: 0,
				availBytes: 0,
				usedBytes: 0,
			},
			{ replicaId: "replica_d", _time: "2026-10-09T14:31:03Z" },
		];

		const metrics = await queryAtomMetrics({
			deploymentId: "dep_123",
			range: "1h",
			createdAt: createdDaysAgo(1),
		});

		expect(queries[2].pipeline).toMatch(
			/summarize arg_max\(_time, totalBytes, availBytes\)\s+by replicaId = tostring\(\['attributes\.horizon\.replica_id'\]\)/,
		);
		expect(metrics.volumes).toEqual([
			{
				replica_id: "replica_b",
				used_bytes: 40 * GIB,
				total_bytes: 50 * GIB,
				at: Date.parse("2026-10-09T14:31:05Z"),
			},
			{
				replica_id: "replica_a",
				used_bytes: 5 * GIB,
				total_bytes: 20 * GIB,
				at: Date.parse("2026-10-09T14:31:00Z"),
			},
		]);
	});

	test("plot a young Atom's few minutes at the raw 10s resolution", async () => {
		const metrics = await queryAtomMetrics({
			deploymentId: "dep_123",
			range: "24h",
			createdAt: Date.now() - 10 * 60 * 1000,
		});

		expect(queries[0].pipeline).toMatch(/arg_max\(.*\)\s+by bin\(_time, 10s\)/);
		expect(metrics.period_seconds).toBe(10);
	});

	test("rate the latest reading over the whole last minute, not its newest window", async () => {
		await queryAtomMetrics({
			deploymentId: "dep_123",
			range: "1h",
			createdAt: createdDaysAgo(1),
		});

		expect(queries[1].startTime).toBe("now-1m");
		expect(queries[1].pipeline).toMatch(
			/summarize _time = max\(_time\),[\s\S]*seconds = sum\(seconds\)$/,
		);
	});

	test("have no latest reading when the Atom logged nothing in the last minute", async () => {
		latestRows = [{ requests: 0, seconds: 0 }];

		const metrics = await queryAtomMetrics({
			deploymentId: "dep_123",
			range: "7d",
			createdAt: createdDaysAgo(30),
		});

		expect(metrics.period_seconds).toBe(7200);
		expect(metrics.latest).toBeNull();
	});

	test.each([
		{ range: "1h", windowSeconds: 10 },
		{ range: "24h", windowSeconds: 10 },
		{ range: "7d", windowSeconds: 60 },
	] as const)(
		"bins $range of health lines into $windowSeconds s windows, within Axiom's 11,000 buckets",
		async ({ range, windowSeconds }) => {
			await queryAtomMetrics({
				deploymentId: "dep_123",
				range,
				createdAt: createdDaysAgo(30),
			});

			const [, binSeconds] =
				queries[0].pipeline.match(/by bin\(_time, (\d+)s\)/) ?? [];
			expect(Number(binSeconds)).toBe(windowSeconds);
			expect(RANGE_SECONDS[range] / windowSeconds + 1).toBeLessThanOrEqual(
				11_000,
			);
		},
	);

	test("reads health lines from each log line's JSON, not the body alien now cuts to the message", async () => {
		await queryAtomMetrics({
			deploymentId: "dep_123",
			range: "1h",
			createdAt: createdDaysAgo(1),
		});

		for (const { pipeline } of queries) {
			expect(pipeline).toContain(`where line contains '"atom_health"'`);
			expect(pipeline).toContain("parse_json(line)");
			expect(pipeline).not.toContain("body");
		}
	});
});

describe("an Atom's metrics period", () => {
	const now = Date.parse("2026-10-12T15:00:00Z");
	const periodFor = ({
		range,
		ageMs,
	}: {
		range: "1h" | "24h" | "7d";
		ageMs: number;
	}) => atomMetricsPeriodSeconds({ range, createdAt: now - ageMs, now });

	test("plots each full range in 60 to 120 points", () => {
		const old = 30 * DAY_MS;
		expect(periodFor({ range: "1h", ageMs: old })).toBe(30);
		expect(periodFor({ range: "24h", ageMs: old })).toBe(15 * 60);
		expect(periodFor({ range: "7d", ageMs: old })).toBe(2 * 60 * 60);
	});

	test("follows a young Atom's life rather than the range it sits in", () => {
		expect(periodFor({ range: "24h", ageMs: 5 * 60 * 1000 })).toBe(10);
		expect(periodFor({ range: "7d", ageMs: 2 * HOUR_MS })).toBe(60);
		expect(periodFor({ range: "7d", ageMs: DAY_MS })).toBe(15 * 60);
	});

	test("never splits a period finer than the range's raw windows", () => {
		expect(periodFor({ range: "7d", ageMs: 10 * 60 * 1000 })).toBe(60);
	});
});
