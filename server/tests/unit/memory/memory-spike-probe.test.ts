import { describe, expect, test } from "bun:test";
import type { InFlightRequestSummary } from "@/utils/memory/inFlightRequests.js";
import {
	createMemorySpikeProbe,
	type MemorySpikeReport,
} from "@/utils/memory/memorySpikeProbe.js";

const buildRequest = ({
	path,
	elapsedMs,
}: {
	path: string;
	elapsedMs: number;
}): InFlightRequestSummary => ({
	method: "POST",
	path,
	elapsedMs,
	orgSlug: undefined,
	customerId: undefined,
});

const buildProbe = ({
	rssSamples,
	requests = [],
	maxReports = 3,
	maxRequestsLogged = 20,
	baselineSamples = 30,
}: {
	rssSamples: number[];
	requests?: InFlightRequestSummary[];
	maxReports?: number;
	maxRequestsLogged?: number;
	baselineSamples?: number;
}) => {
	const reports: MemorySpikeReport[] = [];
	let index = 0;

	const probe = createMemorySpikeProbe({
		readMemoryMB: () => {
			const rssMB = rssSamples[Math.min(index, rssSamples.length - 1)];
			return {
				rssMB,
				heapUsedMB: rssMB / 3,
				heapTotalMB: rssMB / 2,
				externalMB: rssMB / 10,
				arrayBuffersMB: 20,
			};
		},
		listInFlightRequests: () => requests,
		report: (payload) => reports.push(payload),
		ceilingMB: 4500,
		riseMB: 1500,
		baselineSamples,
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
	test("stays silent while memory drifts gently below the ceiling", () => {
		const { reports, sampleAll } = buildProbe({
			rssSamples: [2000, 2200, 2400, 2600, 2900, 3200],
		});

		sampleAll();

		expect(reports).toHaveLength(0);
	});

	test("stays silent for a process that is steadily fat", () => {
		const { reports, sampleAll } = buildProbe({
			rssSamples: [4000, 4050, 3990, 4100, 4020],
		});

		sampleAll();

		expect(reports).toHaveLength(0);
	});

	test("fires on a rapid rise even below the ceiling", () => {
		const { reports, sampleAll } = buildProbe({
			rssSamples: [2000, 2100, 4000],
			requests: [buildRequest({ path: "/v1/customers.list", elapsedMs: 9000 })],
		});

		sampleAll();

		expect(reports).toHaveLength(1);
		expect(reports[0].rssMB).toBe(4000);
		expect(reports[0].arrayBuffersMB).toBe(20);
		expect(reports[0].heapUsedMB).toBeCloseTo(4000 / 3);
		expect(reports[0].requests[0].path).toBe("/v1/customers.list");
	});

	test("fires on the absolute ceiling with no preceding rise", () => {
		const { reports, sampleAll } = buildProbe({
			rssSamples: [4600, 4650],
		});

		sampleAll();

		expect(reports.map((r) => r.rssMB)).toEqual([4600]);
	});

	test("reports once per event, not once per sample", () => {
		const { reports, sampleAll } = buildProbe({
			rssSamples: [2000, 2000, 4200, 4400, 4300, 4250],
		});

		sampleAll();

		expect(reports).toHaveLength(1);
	});

	test("re-arms for a second event once memory settles", () => {
		const { reports, sampleAll } = buildProbe({
			rssSamples: [2000, 4000, 2000, 2000, 3800],
			baselineSamples: 2,
		});

		sampleAll();

		expect(reports.map((r) => r.rssMB)).toEqual([4000, 3800]);
	});

	test("stops reporting once the per-process cap is reached", () => {
		const { reports, sampleAll } = buildProbe({
			rssSamples: [2000, 4000, 2000, 4000, 2000, 4000, 2000, 4000],
			baselineSamples: 2,
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
