import { describe, expect, test } from "bun:test";
import { lockCustomerCurrencyToPlanOps } from "@/internal/balanceWorker/billingPlan/planOps/customer/lockCustomerCurrencyToPlanOps.js";
import { newCustomer, planOf } from "../../billingPlanFixtures.js";

describe("lockCustomerCurrencyToPlanOps", () => {
	test("a plan that locks no currency changes nothing", () => {
		expect(
			lockCustomerCurrencyToPlanOps({ autumnBillingPlan: planOf({}) }),
		).toEqual([]);
	});

	test("a lock sets the currency only where it is still unset", () => {
		expect(
			lockCustomerCurrencyToPlanOps({
				autumnBillingPlan: planOf({
					lockCustomerCurrency: {
						internalCustomerId: newCustomer.internal_id,
						currency: "eur",
					},
				}),
			}),
		).toEqual([
			{
				op: "update",
				table: "customer",
				id: newCustomer.internal_id,
				set: { currency: "eur" },
				whereUnset: true,
			},
		]);
	});
});
