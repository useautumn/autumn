import { describe, expect, test } from "bun:test";
import type {
	BillingPlanOp,
	BillingPlanUpdateOp,
} from "@autumn/balance-engine";
import { CusProductStatus, type CustomerProductUpdate } from "@autumn/shared";
import { updateCustomerProductsToPlanOps } from "@/internal/balanceWorker/billingPlan/planOps/customerProducts/updateCustomerProductsToPlanOps.js";
import { planOf, product } from "../../billingPlanFixtures.js";

const updateOf = ({
	productId,
	updates,
}: {
	productId: string;
	updates: CustomerProductUpdate["updates"];
}): CustomerProductUpdate => ({
	customerProduct: product({ id: productId }),
	updates,
});

const setOn = ({
	productId,
	set,
}: {
	productId: string;
	set: Extract<BillingPlanUpdateOp, { table: "customerProducts" }>["set"];
}): BillingPlanOp => ({
	op: "update",
	table: "customerProducts",
	id: productId,
	set,
});

describe("updateCustomerProductsToPlanOps", () => {
	test("a plan that updates no product changes nothing", () => {
		expect(
			updateCustomerProductsToPlanOps({ autumnBillingPlan: planOf({}) }),
		).toEqual([]);
	});

	test("the singular update comes first, then each of the plural ones", () => {
		expect(
			updateCustomerProductsToPlanOps({
				autumnBillingPlan: planOf({
					updateCustomerProducts: [
						updateOf({
							productId: "cp_b",
							updates: { subscription_ids: ["sub_b"] },
						}),
						updateOf({
							productId: "cp_c",
							updates: { status: CusProductStatus.Expired },
						}),
					],
					updateCustomerProduct: updateOf({
						productId: "cp_a",
						updates: { status: CusProductStatus.Active },
					}),
				}),
			}),
		).toEqual([
			setOn({ productId: "cp_a", set: { status: CusProductStatus.Active } }),
			setOn({ productId: "cp_b", set: { subscription_ids: ["sub_b"] } }),
			setOn({ productId: "cp_c", set: { status: CusProductStatus.Expired } }),
		]);
	});

	test("an update that sets no column is skipped; the others still land", () => {
		expect(
			updateCustomerProductsToPlanOps({
				autumnBillingPlan: planOf({
					updateCustomerProduct: updateOf({ productId: "cp_a", updates: {} }),
					updateCustomerProducts: [
						updateOf({
							productId: "cp_b",
							updates: { subscription_ids: undefined, status: undefined },
						}),
						updateOf({
							productId: "cp_c",
							updates: { canceled: true, subscription_ids: undefined },
						}),
					],
				}),
			}),
		).toEqual([setOn({ productId: "cp_c", set: { canceled: true } })]);
	});

	test("a null clears the column, as an uncancel does, so it is kept", () => {
		expect(
			updateCustomerProductsToPlanOps({
				autumnBillingPlan: planOf({
					updateCustomerProducts: [
						updateOf({
							productId: "cp_a",
							updates: {
								canceled: false,
								canceled_at: null,
								ended_at: null,
								internal_entity_id: null,
								entity_id: null,
							},
						}),
					],
				}),
			}),
		).toEqual([
			setOn({
				productId: "cp_a",
				set: {
					canceled: false,
					canceled_at: null,
					ended_at: null,
					internal_entity_id: null,
					entity_id: null,
				},
			}),
		]);
	});
});
