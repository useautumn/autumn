import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const queryAtomLogsModulePath =
	"@/internal/byoc/actions/telemetry/atomLogs/queryAtomLogs";
const realQueryAtomLogs = { ...(await import(queryAtomLogsModulePath)) };

type Query = { startTime: string; pipeline: string };
const queries: Query[] = [];
let periodRows: Record<string, unknown>[] = [];
let latestRows: Record<string, unknown>[] = [];

mock.module(queryAtomLogsModulePath, () => ({
	queryAtomLogs: async (query: Query) => {
		queries.push(query);
		return query.startTime === "now-1m" ? latestRows : periodRows;
	},
}));

const { queryAtomMetrics } = await import(
	"@/internal/byoc/actions/telemetry/atomLogs/queryAtomMetrics"
);

afterAll(() => {
	mock.module(queryAtomLogsModulePath, () => realQueryAtomLogs);
});

beforeEach(() => {
	queries.length = 0;
	periodRows = [];
	latestRows = [];
});

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
			},
			{ requests: 26, seconds: 130 },
		];
		latestRows = [
			{
				_time: "2026-10-09T14:31:10Z",
				requestsPerSecond: 0.7,
				forwardedPerSecond: 0,
				pushesPerSecond: 0.7,
			},
		];

		const metrics = await queryAtomMetrics({
			deploymentId: "dep_123",
			range: "24h",
		});

		expect(queries.map((query) => query.startTime)).toEqual([
			"now-24h",
			"now-1m",
		]);
		expect(queries[0].pipeline).toMatch(
			/arg_max\(.*\)\s+by bin\(_time, 300s\)/,
		);
		expect(metrics).toEqual({
			period_seconds: 300,
			points: [
				{
					at: Date.parse("2026-10-09T14:30:00Z"),
					cpu: 0.25,
					memory: 0.5,
					maximum: { requests: 1.9, forwarded: 0.1, pushes: 1.9 },
					average: { requests: 0.2, forwarded: 1 / 130, pushes: 0.2 },
				},
			],
			latest: {
				at: Date.parse("2026-10-09T14:31:10Z"),
				requests: 0.7,
				forwarded: 0,
				pushes: 0.7,
			},
		});
	});

	test("plot the last hour at the raw 10s resolution", async () => {
		const metrics = await queryAtomMetrics({
			deploymentId: "dep_123",
			range: "1h",
		});

		expect(queries[0].pipeline).toMatch(/arg_max\(.*\)\s+by bin\(_time, 10s\)/);
		expect(metrics.period_seconds).toBe(10);
	});

	test("have no latest reading when the Atom logged nothing in the last minute", async () => {
		latestRows = [{ requestsPerSecond: 0 }];

		const metrics = await queryAtomMetrics({
			deploymentId: "dep_123",
			range: "7d",
		});

		expect(metrics.period_seconds).toBe(3600);
		expect(metrics.latest).toBeNull();
	});
});
