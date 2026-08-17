import { describe, expect, test } from "bun:test";
import { EventsAggregateParamsSchema } from "./eventsAggregateParams";

describe("EventsAggregateParamsSchema", () => {
	test("accepts feature grouping for deducted aggregations", () => {
		const result = EventsAggregateParamsSchema.safeParse({
			customer_id: "customer",
			feature_id: ["requests", "tokens"],
			aggregate_on: "deducted",
			group_by: "$feature_id",
			range: "30d",
		});

		expect(result.success).toBe(true);
	});

	test("rejects feature grouping without deducted aggregations", () => {
		const result = EventsAggregateParamsSchema.safeParse({
			customer_id: "customer",
			feature_id: "requests",
			group_by: "$feature_id",
			range: "30d",
		});

		expect(result.success).toBe(false);
	});
});
