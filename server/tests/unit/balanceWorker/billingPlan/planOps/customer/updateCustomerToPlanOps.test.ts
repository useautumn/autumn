import { describe, expect, test } from "bun:test";
import type { CustomerUpdate } from "@autumn/shared";
import { updateCustomerToPlanOps } from "@/internal/balanceWorker/billingPlan/planOps/customer/updateCustomerToPlanOps.js";
import { newCustomer, planOf } from "../../billingPlanFixtures.js";

const opsFor = (updates: CustomerUpdate["updates"]) =>
	updateCustomerToPlanOps({
		autumnBillingPlan: planOf({
			updateCustomer: { customer: newCustomer, updates },
		}),
	});

describe("updateCustomerToPlanOps", () => {
	test("a plan that updates no customer changes nothing", () => {
		expect(updateCustomerToPlanOps({ autumnBillingPlan: planOf({}) })).toEqual(
			[],
		);
	});

	test("updates that set no column are skipped, as the Postgres lane skips them", () => {
		expect(opsFor({})).toEqual([]);
		expect(
			opsFor({
				name: undefined,
				email: undefined,
				processor: undefined,
				send_email_receipts: undefined,
			}),
		).toEqual([]);
	});

	test("only the defined columns are set, on the row named by internal_id", () => {
		expect(
			opsFor({
				name: "Ada",
				email: undefined,
				processor: { id: "cus_stripe_2", type: "stripe" },
				send_email_receipts: true,
			}),
		).toEqual([
			{
				op: "update",
				table: "customer",
				id: "cus_internal_test",
				set: {
					name: "Ada",
					processor: { id: "cus_stripe_2", type: "stripe" },
					send_email_receipts: true,
				},
			},
		]);
	});

	test("a null clears the column, so it is kept", () => {
		expect(opsFor({ name: null, email: null })).toEqual([
			{
				op: "update",
				table: "customer",
				id: "cus_internal_test",
				set: { name: null, email: null },
			},
		]);
	});
});
