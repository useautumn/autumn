import { describe, expect, test } from "bun:test";
import type { AtomMetricsPoint } from "@autumn/shared";
import {
	ATOM_STORAGE_PER_GIB_LABEL,
	atomMonthlyCost,
	atomStorageMonthlyEstimate,
	atomStorageMonthlyIncrease,
	atomVolumePresets,
	atomVolumeSize,
} from "@/views/settings/sections/components/atom/atomVolumeDisplay";
import { toAtomMetricsChartData } from "@/views/settings/sections/components/atom/monitoring/atomMetricsChartData";
import {
	atomEvictionBuckets,
	atomEvictionsTotal,
	atomReplicaLines,
	atomVolumeUsage,
	formatEvictionsCount,
} from "@/views/settings/sections/components/atom/monitoring/atomStorageDisplay";

const GIB = 1024 ** 3;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const MEDIUM = {
	cpu: 4,
	memory: 8,
	instanceType: "c8g.xlarge",
	container: { cpu: 3, memory: 6 },
	hourlyUsd: 0.15952,
} as const;

const rates = { requests: 0, forwarded: 0, pushes: 0 };

describe("Atom storage prices", () => {
	test("each preset is priced for both replicas' volumes", () => {
		expect(
			atomVolumePresets().map((volumeSizeGib) =>
				atomStorageMonthlyEstimate({ volumeSizeGib }),
			),
		).toEqual(["~$3.20", "~$8.00", "~$16.00"]);
		expect(ATOM_STORAGE_PER_GIB_LABEL).toBe("$0.16 / GiB / mo");
	});

	test("the month's estimate splits into compute and storage", () => {
		expect(atomMonthlyCost({ machine: MEDIUM, volumeSizeGib: 50 })).toEqual({
			total: "$241",
			compute: "$233",
			storage: "$8",
		});
	});

	test("growing 20 to 50 GiB adds $4.80 a month", () => {
		expect(atomStorageMonthlyIncrease({ fromGib: 20, toGib: 50 })).toBe(
			"+$4.80",
		);
	});

	test("only presets above the current size are offered to grow to", () => {
		expect(atomVolumePresets({ aboveGib: 20 })).toEqual([50, 100]);
		expect(atomVolumePresets({ aboveGib: 100 })).toEqual([]);
	});
});

describe("a typed volume size", () => {
	const typed = (customGib: string, aboveGib?: number) =>
		atomVolumeSize({ choice: { presetGib: null, customGib }, aboveGib });

	test("is a whole GiB within the API's bounds", () => {
		expect(typed("200")).toEqual({ gib: 200, error: null });
		expect(typed("")).toEqual({ gib: null, error: null });
		expect(typed("12.5").error).toBe("Use a whole number of GiB");
		expect(typed("lots").error).toBe("Use a whole number of GiB");
		expect(typed("10").error).toBe("Use at least 20 GiB");
		expect(typed("70000").error).toBe("Use at most 65536 GiB");
	});

	test("must exceed the current size when growing", () => {
		expect(typed("20", 20).error).toBe("Use more than 20 GiB");
		expect(typed("21", 20)).toEqual({ gib: 21, error: null });
	});
});

describe("the storage card's readings", () => {
	test("reads the fullest replica, never 0% for an unknown total", () => {
		expect(
			atomVolumeUsage({
				replica_id: "replica_a",
				used_bytes: 15.2 * GIB,
				total_bytes: 20 * GIB,
				at: 0,
			}),
		).toEqual({ used: "15.2", total: "20", share: 0.76 });
		expect(
			atomVolumeUsage({
				replica_id: "replica_a",
				used_bytes: 0,
				total_bytes: 0,
				at: 0,
			}),
		).toBeNull();
		expect(atomVolumeUsage(undefined)).toBeNull();
	});

	test("says when a replica is not reporting", () => {
		expect(
			atomReplicaLines([
				{
					replica_id: "replica_b",
					used_bytes: 14.8 * GIB,
					total_bytes: 20 * GIB,
					at: 0,
				},
			]),
		).toEqual(["Replica 1 · 14.8 / 20 GiB", "Replica 2 · not reporting"]);
	});

	test("counts evictions in the window", () => {
		expect(formatEvictionsCount(1240)).toBe("1,240 evicted");
		expect(formatEvictionsCount(0)).toBe("0 evicted");
	});
});

describe("hourly evictions", () => {
	const NOW = Date.parse("2026-10-16T12:00:05Z");
	/** 15-minute periods over the last 3 hours, oldest first. */
	const chartData = (evictedPerPeriod: number[]) => {
		const points: AtomMetricsPoint[] = evictedPerPeriod.map(
			(evicted, index) => ({
				at: NOW - 3 * HOUR_MS + index * 15 * MINUTE_MS,
				cpu: 0.1,
				memory: 0.2,
				disk: 0.8,
				evicted,
				maximum: rates,
				average: rates,
			}),
		);
		const data = toAtomMetricsChartData({
			points,
			latest: null,
			periodSeconds: 15 * 60,
			range: "24h",
			statistic: "maximum",
			fetchedAt: NOW,
		});
		if (!data) throw new Error("expected chart data");
		return data;
	};

	test("sums each hour's periods into one bar and skips hours with none", () => {
		const data = chartData([10, 20, 0, 5, 0, 0, 0, 0, 100, 0, 0, 1]);
		const buckets = atomEvictionBuckets({ chartData: data, bucketMs: HOUR_MS });
		expect(buckets.map(({ evicted }) => evicted)).toEqual([35, 101]);
		expect(atomEvictionsTotal(data)).toBe(136);
	});

	test("keeps every bar inside the plotted span", () => {
		const data = chartData([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7]);
		const [from, to] = data.timeAxis.domain;
		for (const bucket of atomEvictionBuckets({
			chartData: data,
			bucketMs: HOUR_MS,
		})) {
			expect(bucket.at).toBeGreaterThanOrEqual(from);
			expect(bucket.endAt).toBeLessThanOrEqual(to);
		}
	});
});
