/**
 * Contract: eligible UTC property groups use daily states, while exact range edges stay hourly.
 * Reconciliation uses customer-daily states only when no property filter requires raw events.
 */
import { expect, test } from "bun:test";
import {
	buildCountAndSumQuery,
	hasCompleteUtcDay,
	selectCountAndSumSource,
	shouldUsePropertyDailyRollup,
} from "@/internal/analytics/actions/dailyRollupRouting.js";

test("daily property rollup: routes eligible UTC day, week, and month groups", () => {
	for (const binSize of ["day", "week", "month"]) {
		expect(
			shouldUsePropertyDailyRollup({
				binSize,
				dailyRollupsEnabled: true,
				endDate: "2026-08-03 16:00:00",
				groupColumn: "property",
				hasPropertyFilters: false,
				skipPropertyRollup: false,
				startDate: "2026-07-01 12:00:00",
				timezone: "UTC",
			}),
		).toBe(true);
	}
});

test("daily property rollup: keeps unsupported query shapes hourly", () => {
	const base = {
		binSize: "day",
		dailyRollupsEnabled: true,
		endDate: "2026-08-03 16:00:00",
		groupColumn: "property" as const,
		hasPropertyFilters: false,
		skipPropertyRollup: false,
		startDate: "2026-07-01 12:00:00",
		timezone: "UTC",
	};

	expect(shouldUsePropertyDailyRollup({ ...base, binSize: "hour" })).toBe(
		false,
	);
	expect(
		shouldUsePropertyDailyRollup({
			...base,
			dailyRollupsEnabled: false,
		}),
	).toBe(false);
	expect(
		shouldUsePropertyDailyRollup({
			...base,
			startDate: "2026-08-03 00:00:00",
		}),
	).toBe(false);
	expect(shouldUsePropertyDailyRollup({ ...base, binSize: "invalid" })).toBe(
		false,
	);
	expect(
		shouldUsePropertyDailyRollup({ ...base, timezone: "Europe/London" }),
	).toBe(false);
	expect(
		shouldUsePropertyDailyRollup({ ...base, hasPropertyFilters: true }),
	).toBe(false);
	expect(
		shouldUsePropertyDailyRollup({ ...base, groupColumn: "customer_id" }),
	).toBe(false);
	expect(
		shouldUsePropertyDailyRollup({ ...base, skipPropertyRollup: true }),
	).toBe(false);
});

test("daily rollups: detect complete UTC days across supported date formats", () => {
	expect(
		hasCompleteUtcDay({
			startDate: "2026-08-01 00:00:00",
			endDate: "2026-08-02T12:00:00",
		}),
	).toBe(true);
	expect(
		hasCompleteUtcDay({
			startDate: "2026-08-01 12:00:00",
			endDate: "2026-08-02 12:00:00",
		}),
	).toBe(false);
	expect(
		hasCompleteUtcDay({
			startDate: "2026-08-03 00:00:00",
			endDate: "2026-08-03 23:59:59",
		}),
	).toBe(false);
});

test("daily totals: select the narrowest exact source", () => {
	expect(
		selectCountAndSumSource({
			containsCompleteUtcDay: true,
			dailyRollupsEnabled: true,
			hasCustomerId: true,
			hasEntityId: false,
			hasPropertyFilters: false,
		}),
	).toBe("customer_daily");
	expect(
		selectCountAndSumSource({
			containsCompleteUtcDay: true,
			dailyRollupsEnabled: true,
			hasCustomerId: true,
			hasEntityId: true,
			hasPropertyFilters: false,
		}),
	).toBe("customer_daily");
	expect(
		selectCountAndSumSource({
			containsCompleteUtcDay: true,
			dailyRollupsEnabled: true,
			hasCustomerId: false,
			hasEntityId: false,
			hasPropertyFilters: false,
		}),
	).toBe("org_hourly");
	expect(
		selectCountAndSumSource({
			containsCompleteUtcDay: true,
			dailyRollupsEnabled: true,
			hasCustomerId: true,
			hasEntityId: false,
			hasPropertyFilters: true,
		}),
	).toBe("raw_events");
	expect(
		selectCountAndSumSource({
			containsCompleteUtcDay: true,
			dailyRollupsEnabled: false,
			hasCustomerId: true,
			hasEntityId: false,
			hasPropertyFilters: false,
		}),
	).toBe("customer_hourly");
	expect(
		selectCountAndSumSource({
			containsCompleteUtcDay: false,
			dailyRollupsEnabled: true,
			hasCustomerId: true,
			hasEntityId: false,
			hasPropertyFilters: false,
		}),
	).toBe("customer_hourly");
});

test("daily totals: combine merged full days with hourly range edges", () => {
	const query = buildCountAndSumQuery({ source: "customer_daily" });

	expect(query).toContain("events_customer_daily_mv");
	expect(query).toContain("sumMerge(event_count)");
	expect(query).toContain("events_customer_hourly_mv");
	expect(query).toContain("hour <");
	expect(query).toContain("hour >= toStartOfDay");
	expect(query).toContain("GROUP BY event_name");
});

test("daily totals: preserve raw filtered and org-hourly query paths", () => {
	const rawQuery = buildCountAndSumQuery({
		source: "raw_events",
		filterBySql: "\nAND properties.kind::String = {filter_value_0:String}",
		hasEntityId: true,
	});
	const orgQuery = buildCountAndSumQuery({ source: "org_hourly" });

	expect(rawQuery).toContain("FROM events");
	expect(rawQuery).toContain("customer_id = {customer_id:String}");
	expect(rawQuery).toContain("entity_id = {entity_id:String}");
	expect(rawQuery).toContain("properties.kind::String");
	expect(orgQuery).toContain("FROM events_org_hourly_mv");
	expect(orgQuery).not.toContain("customer_id =");
});
