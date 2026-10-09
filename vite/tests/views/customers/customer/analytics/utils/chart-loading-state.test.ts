import { describe, expect, test } from "bun:test";
import {
	chartGeometryOf,
	chartLoadingState,
} from "@/views/customers/customer/analytics/utils/chartLoadingState";

const last30Days = chartGeometryOf({
	interval: "30d",
	binSize: null,
	start: null,
	end: null,
});

describe("chartLoadingState", () => {
	test("nothing shown yet lays out stubs", () => {
		expect(chartLoadingState({ current: last30Days, previous: null })).toBe(
			"stubs",
		);
	});

	test("same range and bin size dims the last chart", () => {
		expect(
			chartLoadingState({ current: last30Days, previous: last30Days }),
		).toBe("dim");
	});

	test("the default bin size and the same one picked explicitly are one geometry", () => {
		const explicitDay = chartGeometryOf({
			interval: "30d",
			binSize: "day",
			start: null,
			end: null,
		});
		expect(
			chartLoadingState({ current: explicitDay, previous: last30Days }),
		).toBe("dim");
	});

	test("a new range lays out stubs", () => {
		const last7Days = chartGeometryOf({
			interval: "7d",
			binSize: null,
			start: null,
			end: null,
		});
		expect(
			chartLoadingState({ current: last7Days, previous: last30Days }),
		).toBe("stubs");
	});

	test("a new bin size lays out stubs", () => {
		const byWeek = chartGeometryOf({
			interval: "30d",
			binSize: "week",
			start: null,
			end: null,
		});
		expect(chartLoadingState({ current: byWeek, previous: last30Days })).toBe(
			"stubs",
		);
	});

	test("moving a custom window lays out stubs; stray start/end on presets are ignored", () => {
		const custom = (start: number) =>
			chartGeometryOf({
				interval: "custom",
				binSize: "day",
				start,
				end: start + 10 * 86_400_000,
			});
		expect(
			chartLoadingState({ current: custom(2_000), previous: custom(1_000) }),
		).toBe("stubs");
		expect(
			chartLoadingState({
				current: chartGeometryOf({
					interval: "30d",
					binSize: null,
					start: 5,
					end: 9,
				}),
				previous: last30Days,
			}),
		).toBe("dim");
	});
});
