import { describe, expect, test } from "bun:test";
import type { MigrationFilter, Operations, UpdatePlanOp } from "@autumn/shared";
import { preProcessMigrationOperations } from "@/internal/migrations/v2/run/preProcess/preProcessMigrationOperations";

const operations: Operations = {
	customer: [
		{
			type: "update_plan",
			plan_filter: { plan_id: "pro", version: 1 },
			version: 1,
		},
	],
};

const firstUpdatePlan = (ops: Operations): UpdatePlanOp => {
	const op = ops.customer?.[0];
	if (op?.type === "update_plan") return op;
	throw new Error("Expected first operation to update a plan");
};

const process = (filter?: MigrationFilter) =>
	firstUpdatePlan(preProcessMigrationOperations({ operations, filter }));

describe("preProcessMigrationOperations custom guard", () => {
	test("defaults version migrations to non-custom plans", () => {
		expect(process().plan_filter).toEqual({
			plan_id: "pro",
			version: 1,
			custom: false,
		});
	});

	test("keeps custom plans eligible when the migration targets one customer", () => {
		expect(
			process({ customer: { customer_id: "cus_1" } }).plan_filter,
		).toEqual({
			plan_id: "pro",
			version: 1,
		});
	});

	test("keeps custom plans eligible when the filter explicitly targets custom", () => {
		expect(
			process({ customer: { plan: { plan_id: "pro", custom: true } } })
				.plan_filter,
		).toEqual({
			plan_id: "pro",
			version: 1,
		});
	});

	test("keeps custom plans eligible through plan quantifiers and OR filters", () => {
		expect(
			process({
				customer: {
					plan: {
						$some: {
							plan_id: "pro",
							$or: [{ version: 1 }, { custom: true }],
						},
					},
				},
			}).plan_filter,
		).toEqual({
			plan_id: "pro",
			version: 1,
		});
	});
});
