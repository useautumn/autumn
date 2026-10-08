import { describe, expect, test } from "bun:test";
import { CreateInvoiceParamsSchema } from "./createInvoiceParams.js";

const JAN_1 = Date.UTC(2026, 0, 1);
const JAN_16 = Date.UTC(2026, 0, 16);

const accepts = (params: Record<string, unknown>) =>
	CreateInvoiceParamsSchema.safeParse({ customer_id: "cus", ...params })
		.success;

const plan = (extra: Record<string, unknown>) => ({
	plans: [{ plan_id: "pro", ...extra }],
});

const usersPrepaid = { feature_id: "users", billing_behavior: "prepaid" };

describe("CreateInvoiceParams payment timing and line periods", () => {
	test("rejects due_date together with net_terms_days", () => {
		expect(
			accepts({ due_date: Date.now() + 86_400_000, net_terms_days: 30 }),
		).toBe(false);
		expect(accepts({ net_terms_days: 30 })).toBe(true);
	});

	test("accepts a period on plans, feature and license quantities and custom lines", () => {
		const period = { period_start: JAN_1, period_end: JAN_16 };
		expect(
			accepts({
				plans: [
					{
						plan_id: "pro",
						...period,
						feature_quantities: [{ ...usersPrepaid, quantity: 1, ...period }],
						license_quantities: [
							{
								license_plan_id: "seat",
								quantity: 1,
								...period,
								feature_quantities: [
									{ ...usersPrepaid, quantity: 1, ...period },
								],
							},
						],
					},
				],
				custom_line_items: [{ description: "Setup", amount: 5, ...period }],
			}),
		).toBe(true);
	});

	test("a line period needs both ends, with the end after the start", () => {
		expect(accepts(plan({ period_start: JAN_1 }))).toBe(false);
		expect(accepts(plan({ period_start: JAN_16, period_end: JAN_1 }))).toBe(
			false,
		);
		expect(
			accepts({
				custom_line_items: [
					{ description: "Setup", amount: 5, period_end: JAN_16 },
				],
			}),
		).toBe(false);
		expect(
			accepts(
				plan({
					feature_quantities: [
						{ ...usersPrepaid, quantity: 1, period_start: JAN_1 },
					],
				}),
			),
		).toBe(false);
	});

	test("rejects one feature and billing behaviour twice in a plan, but allows prepaid plus usage-based", () => {
		expect(
			accepts(
				plan({
					feature_quantities: [
						{ ...usersPrepaid, quantity: 1 },
						{ ...usersPrepaid, quantity: 2 },
					],
				}),
			),
		).toBe(false);
		expect(
			accepts(
				plan({
					license_quantities: [
						{
							license_plan_id: "seat",
							quantity: 1,
							feature_quantities: [
								{ ...usersPrepaid, quantity: 1 },
								{ ...usersPrepaid, quantity: 2 },
							],
						},
					],
				}),
			),
		).toBe(false);
		expect(
			accepts(
				plan({
					feature_quantities: [
						{ ...usersPrepaid, quantity: 1 },
						{
							feature_id: "users",
							billing_behavior: "usage_based",
							quantity: 2,
						},
					],
				}),
			),
		).toBe(true);
	});
});
