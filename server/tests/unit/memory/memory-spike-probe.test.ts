import { describe, expect, test } from "bun:test";
import type { InFlightRequestSummary } from "@/utils/memory/inFlightRequests.js";
import {
	createMemorySpikeProbe,
	type MemorySpikeReport,
} from "@/utils/memory/memorySpikeProbe.js";

const buildRequest = ({
	path,
	elapsedMs,
	orgSlug,
}: {
	path: string;
	elapsedMs: number;
	orgSlug?: string;
}): InFlightRequestSummary => ({
	method: "POST",
	path,
	elapsedMs,
	orgSlug,
	customerId: undefined,
});

const buildProbe = ({
	rssSamples,
	requests = [],
	maxReports = 3,
	maxRequestsLogged = 20,
}: {
	rssSamples: number[];
	requests?: InFlightRequestSummary[];
	maxReports?: number;
	maxRequestsLogged?: number;
}) => {
	const reports: MemorySpikeReport[] = [];
	let index = 0;

	const probe = createMemorySpikeProbe({
		readRssMB: () => rssSamples[Math.min(index, rssSamples.length - 1)],
		listInFlightRequests: () => requests,
		report: (payload) => reports.push(payload),
		thresholdMB: 4500,
		rearmMB: 3500,
		maxReports,
		maxRequestsLogged,
	});

	const sampleAll = () => {
		for (index = 0; index < rssSamples.length; index++) {
			probe.sample();
		}
	};

	return { reports, sampleAll };
};

describe("memorySpikeProbe", () => {
	test("stays silent while rss is below the threshold", () => {
		const { reports, sampleAll } = buildProbe({
			rssSamples: [3000, 3200, 4499],
		});

		sampleAll();

		expect(reports).toHaveLength(0);
	});

	test("reports once when rss crosses the threshold", () => {
		const { reports, sampleAll } = buildProbe({
			rssSamples: [3000, 4600, 5200, 6000],
			requests: [
				buildRequest({ path: "/v1/entities.list", elapsedMs: 12_000 }),
			],
		});

		sampleAll();

		expect(reports).toHaveLength(1);
		expect(reports[0].rssMB).toBe(4600);
		expect(reports[0].inFlightCount).toBe(1);
		expect(reports[0].requests[0].path).toBe("/v1/entities.list");
	});

	test("re-arms only after rss falls back below the rearm level", () => {
		const { reports, sampleAll } = buildProbe({
			rssSamples: [4600, 4000, 4700, 3000, 4800],
		});

		sampleAll();

		expect(reports.map((r) => r.rssMB)).toEqual([4600, 4800]);
	});

	test("stops reporting once the per-process cap is reached", () => {
		const { reports, sampleAll } = buildProbe({
			rssSamples: [4600, 3000, 4600, 3000, 4600, 3000, 4600],
			maxReports: 2,
		});

		sampleAll();

		expect(reports).toHaveLength(2);
	});

	test("keeps the longest-running requests when trimming the list", () => {
		const { reports, sampleAll } = buildProbe({
			rssSamples: [4600],
			requests: [
				buildRequest({ path: "/v1/check", elapsedMs: 5 }),
				buildRequest({ path: "/v1/entities.list", elapsedMs: 21_000 }),
				buildRequest({ path: "/v1/track", elapsedMs: 12 }),
			],
			maxRequestsLogged: 2,
		});

		sampleAll();

		expect(reports[0].inFlightCount).toBe(3);
		expect(reports[0].requests).toHaveLength(2);
		expect(reports[0].requests[0].path).toBe("/v1/entities.list");
	});
});
