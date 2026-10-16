import { describe, expect, test } from "bun:test";
import type { AtomMetricsPoint } from "@autumn/shared";
import { toAtomMetricsChartData } from "@/views/settings/sections/components/atom/monitoring/atomMetricsChartData";
import { atomRequestsHeadline } from "@/views/settings/sections/components/atom/monitoring/atomRequestsHeadline";

const MINUTE_MS = 60_000;
const NOW = Date.parse("2026-10-12T15:00:05Z");

const rates = (requests: number) => ({
	requests,
	forwarded: requests / 10,
	pushes: 1,
});

/** One 30s period every 30s across the last 10 minutes, at the given req/s from oldest to newest. */
const points = (requestsPerPeriod: number[]): AtomMetricsPoint[] =>
	requestsPerPeriod.map((requests, index) => ({
		at: NOW - 10 * MINUTE_MS + index * 30_000,
		cpu: 0.05,
		memory: 0.2,
		disk: null,
		evicted: 0,
		maximum: rates(requests),
		average: rates(requests),
	}));

const headlineFor = ({
	periods,
	lastMinute,
}: {
	periods: number[];
	lastMinute: number | null;
}) =>
	atomRequestsHeadline(
		toAtomMetricsChartData({
			points: points(periods),
			latest:
				lastMinute === null ? null : { at: NOW - 15_000, ...rates(lastMinute) },
			periodSeconds: 30,
			range: "1h",
			statistic: "maximum",
			fetchedAt: NOW,
		}),
	);

describe("the Atom's req/s headline", () => {
	test("reads the last minute when the newest period is still filling with a fraction of its traffic", () => {
		const busy = Array.from({ length: 19 }, () => 12);
		expect(headlineFor({ periods: [...busy, 0.4], lastMinute: 11 })).toEqual({
			kind: "rate",
			requests: 11,
			answeredShare: 0.9,
		});
	});

	test("reads the last minute when the newest period has no point yet", () => {
		const busy = Array.from({ length: 19 }, () => 12);
		expect(headlineFor({ periods: busy, lastMinute: 12 })).toMatchObject({
			kind: "rate",
			requests: 12,
		});
	});

	test("says how long it has been idle instead of a bare 0", () => {
		const busyThenQuiet = [
			...Array.from({ length: 14 }, () => 12),
			...Array.from({ length: 6 }, () => 0),
		];
		expect(headlineFor({ periods: busyThenQuiet, lastMinute: 0 })).toEqual({
			kind: "idle",
			idleFor: "3 min",
		});
	});

	test("counts idle from where the chart starts when nothing was ever sent", () => {
		expect(
			headlineFor({
				periods: Array.from({ length: 20 }, () => 0),
				lastMinute: 0,
			}),
		).toEqual({ kind: "idle", idleFor: "10 min" });
	});

	test("shows no reading when Atom reported nothing in the last minute", () => {
		expect(headlineFor({ periods: [12, 12], lastMinute: null })).toEqual({
			kind: "silent",
		});
	});
});
