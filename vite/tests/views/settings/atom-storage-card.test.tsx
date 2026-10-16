import { describe, expect, mock, test } from "bun:test";
import type { AtomMetricsPoint } from "@autumn/shared";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@/views/settings/sections/components/atom/useAtomActions", () => ({
	useAtomActions: () => ({ increaseStorage: async () => {} }),
}));
mock.module("@/hooks/queries/useAtomUpdateQuery", () => ({
	useAtomUpdateQuery: () => null,
}));

const { AtomStorageChart } = await import(
	"../../../src/views/settings/sections/components/atom/monitoring/AtomStorageChart"
);
const { toAtomMetricsChartData } = await import(
	"../../../src/views/settings/sections/components/atom/monitoring/atomMetricsChartData"
);

const GIB = 1024 ** 3;
const NOW = Date.parse("2026-10-16T12:00:05Z");
const rates = { requests: 0, forwarded: 0, pushes: 0 };

/** The storage card's text over 15-minute periods with `evictedPerPeriod`. */
const renderStorageCard = (evictedPerPeriod: number[]) => {
	const points: AtomMetricsPoint[] = evictedPerPeriod.map((evicted, index) => ({
		at: NOW - 3 * 60 * 60_000 + index * 15 * 60_000,
		cpu: 0.1,
		memory: 0.2,
		disk: 0.5,
		evicted,
		maximum: rates,
		average: rates,
	}));
	const chartData = toAtomMetricsChartData({
		points,
		latest: null,
		periodSeconds: 15 * 60,
		range: "24h",
		statistic: "maximum",
		fetchedAt: NOW,
	});
	return renderToStaticMarkup(
		<AtomStorageChart
			cache={null}
			chartData={chartData}
			volumes={[
				{
					replica_id: "replica_a",
					used_bytes: 10 * GIB,
					total_bytes: 20 * GIB,
					at: NOW,
				},
			]}
			range="24h"
			isLoading={false}
		/>,
	)
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ");
};

describe("the storage card's evictions", () => {
	test("are hidden when the window evicted no one", () => {
		const text = renderStorageCard([0, 0, 0, 0, 0, 0]);
		expect(text).toContain("10 / 20 GiB");
		expect(text).not.toContain("evicted");
		expect(text).not.toContain("Evicted per hour");
	});

	test("show their count and hourly bars once anyone was evicted", () => {
		const text = renderStorageCard([0, 0, 3, 0, 0, 4]);
		expect(text).toContain("10 / 20 GiB");
		expect(text).toContain("7 evicted");
		expect(text).toContain("Evicted per hour");
	});
});
