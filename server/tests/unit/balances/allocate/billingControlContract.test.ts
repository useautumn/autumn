import { describe, expect, test } from "bun:test";
import {
	ApiEntityBillingControlsParamsSchema,
	ApiEntityBillingControlsUpdateSchema,
	BalanceAllocationControlsSchema,
	CustomerBillingControlsResponseSchema,
	CustomerDataSchema,
	PlanBillingControlsParamsSchema,
	ResetInterval,
	UpdateCustomerParamsV1Schema,
} from "@autumn/shared";

const control = {
	feature_id: "credits",
	interval: ResetInterval.Month,
	allocations: [{ entity_id: "site_1", amount: 20000 }],
};

describe("customer allocation billing control contract", () => {
	test("customer update accepts the control and preserves omitted versus empty", () => {
		const parse = (billing_controls: unknown) =>
			UpdateCustomerParamsV1Schema.parse({
				customer_id: "customer_123",
				billing_controls,
			}).billing_controls;
		expect(parse({})?.balance_allocations).toBeUndefined();
		expect(parse({ balance_allocations: [] })?.balance_allocations).toEqual([]);
		expect(
			parse({ balance_allocations: [control] })?.balance_allocations,
		).toEqual([control]);
	});

	test("customer responses retain requested allocations", () => {
		expect(
			CustomerBillingControlsResponseSchema.parse({
				balance_allocations: [control],
			}).balance_allocations,
		).toEqual([control]);
	});

	test("rejects allocations outside customer update", () => {
		const billing_controls = { balance_allocations: [control] };
		expect(CustomerDataSchema.safeParse({ billing_controls }).success).toBe(
			false,
		);
		for (const schema of [
			PlanBillingControlsParamsSchema,
			ApiEntityBillingControlsParamsSchema,
			ApiEntityBillingControlsUpdateSchema,
		]) {
			expect(schema.safeParse(billing_controls).success).toBe(false);
		}
	});

	test("rejects duplicate features and entities", () => {
		expect(
			BalanceAllocationControlsSchema.safeParse([control, control]).success,
		).toBe(false);
		expect(
			BalanceAllocationControlsSchema.safeParse([
				{
					...control,
					allocations: [...control.allocations, ...control.allocations],
				},
			]).success,
		).toBe(false);
	});

	test("accepts a full thousand-entity replacement, not a thousand and one", () => {
		const allocations = Array.from({ length: 1000 }, (_, index) => ({
			entity_id: `site_${index}`,
			amount: 1,
		}));
		expect(
			BalanceAllocationControlsSchema.safeParse([{ ...control, allocations }])
				.success,
		).toBe(true);
		expect(
			BalanceAllocationControlsSchema.safeParse([
				{
					...control,
					allocations: [...allocations, { entity_id: "extra", amount: 1 }],
				},
			]).success,
		).toBe(false);
	});

	test("allows clear and zero but rejects invalid amounts", () => {
		for (const amount of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(
				BalanceAllocationControlsSchema.safeParse([
					{ ...control, allocations: [{ entity_id: "site_1", amount }] },
				]).success,
			).toBe(false);
		}
		expect(BalanceAllocationControlsSchema.safeParse([]).success).toBe(true);
		expect(
			BalanceAllocationControlsSchema.safeParse([
				{ ...control, allocations: [{ entity_id: "site_1", amount: 0 }] },
			]).success,
		).toBe(true);
	});
});
