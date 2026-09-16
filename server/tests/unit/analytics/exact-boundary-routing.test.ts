import { expect, test } from "bun:test";
import { buildCountAndSumQuery } from "@/internal/analytics/actions/dailyRollupRouting.js";

test("rollup totals read complete hours and one exact raw edge range", () => {
	for (const source of [
		"org_hourly",
		"customer_hourly",
		"customer_daily",
	] as const) {
		const query = buildCountAndSumQuery({ source });
		expect(query).toContain("AS full_hours_start");
		expect(query).toContain("AS full_hours_end");
		expect(query).toContain(
			"hour >= full_hours_start AND hour < full_hours_end",
		);
		expect(query).toContain(
			"timestamp >= {start_date:DateTime} AND timestamp <= {end_date:DateTime}",
		);
		expect(query).toContain(
			"timestamp < full_hours_start OR timestamp >= full_hours_end",
		);
		expect(query.match(/FROM events\s/g)?.length).toBe(1);
	}
});

test("raw edges preserve customer and entity scope without restricting org totals", () => {
	const customerQuery = buildCountAndSumQuery({
		source: "customer_hourly",
		hasEntityId: true,
	});
	expect(
		customerQuery.match(/customer_id = \{customer_id:String\}/g)?.length,
	).toBe(2);
	expect(customerQuery.match(/entity_id = \{entity_id:String\}/g)?.length).toBe(
		2,
	);
	expect(
		customerQuery.match(/org_id = \{org_id:String\} AND env = \{env:String\}/g)
			?.length,
	).toBe(2);

	const orgQuery = buildCountAndSumQuery({
		source: "org_hourly",
		aggregateAll: true,
	});
	expect(orgQuery).not.toContain("customer_id =");
	expect(orgQuery).not.toContain("entity_id =");
});

test("raw-only totals retain exact property filtering without a rollup union", () => {
	const query = buildCountAndSumQuery({
		source: "raw_events",
		filterBySql: "AND properties.region::String = {filter_value_0:String}",
	});
	expect(query).toContain(
		"properties.region::String = {filter_value_0:String}",
	);
	expect(query).not.toContain("UNION ALL");
	expect(query).not.toContain("full_hours_start");
});
