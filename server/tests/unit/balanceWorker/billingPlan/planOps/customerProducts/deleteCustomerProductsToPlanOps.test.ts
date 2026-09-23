import { describe, expect, test } from "bun:test";
import type { BillingPlanOp } from "@autumn/balance-engine";
import { deleteCustomerProductsToPlanOps } from "@/internal/balanceWorker/billingPlan/planOps/customerProducts/deleteCustomerProductsToPlanOps.js";
import { planOf, product } from "../../billingPlanFixtures.js";

const deleteOf = (id: string): BillingPlanOp => ({
	op: "delete",
	table: "customerProducts",
	id,
});

describe("deleteCustomerProductsToPlanOps", () => {
	test("a plan that deletes no product changes nothing", () => {
		expect(
			deleteCustomerProductsToPlanOps({ autumnBillingPlan: planOf({}) }),
		).toEqual([]);
		expect(
			deleteCustomerProductsToPlanOps({
				autumnBillingPlan: planOf({ deleteCustomerProducts: [] }),
			}),
		).toEqual([]);
	});

	test("each deleted product is one delete of the product alone; the engine cascades its rows", () => {
		expect(
			deleteCustomerProductsToPlanOps({
				autumnBillingPlan: planOf({
					deleteCustomerProduct: product({ id: "cp_scheduled" }),
					deleteCustomerProducts: [
						product({ id: "cp_a" }),
						product({ id: "cp_b" }),
					],
				}),
			}),
		).toEqual([deleteOf("cp_scheduled"), deleteOf("cp_a"), deleteOf("cp_b")]);
	});
});
