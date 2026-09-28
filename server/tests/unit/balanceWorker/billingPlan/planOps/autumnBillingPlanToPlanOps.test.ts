import { describe, expect, test } from "bun:test";
import type { BillingPlanOp } from "@autumn/balance-engine";
import { CusProductStatus } from "@autumn/shared";
import { autumnBillingPlanToPlanOps } from "@/internal/balanceWorker/billingPlan/planOps/autumnBillingPlanToPlanOps.js";
import {
	createCustomerPlan,
	defaultProduct,
	firstGrantOf,
	linkBackPlan,
	minimalLooseGrant,
	newCustomer,
	planOf,
	product,
	workerEntity,
} from "../billingPlanFixtures.js";

const described = (ops: BillingPlanOp[]) =>
	ops.map((op) =>
		op.op === "insert"
			? `insert:${op.table}:${op.row.id}`
			: `${op.op}:${op.table}:${op.id}`,
	);

/** One of every facet the worker holds, each on its own rows. */
const everyFacetPlan = () => {
	const patched = product({ id: "cp_patched" });
	const [patchedPrice] = patched.customer_prices;
	if (!patchedPrice) throw new Error("fixture has no price");
	return planOf({
		insertCustomer: newCustomer,
		updateCustomer: { customer: newCustomer, updates: { name: "Ada" } },
		insertCustomerEntitlements: [minimalLooseGrant()],
		patchCustomerProducts: [
			{
				customerProduct: patched,
				insertCustomerEntitlements: [],
				insertCustomerPrices: [],
				deleteCustomerPrices: [patchedPrice],
				deleteCustomerEntitlements: [],
			},
		],
		insertEntities: [workerEntity],
		insertCustomerProducts: [product({ id: "cp_inserted" })],
		lockCustomerCurrency: {
			internalCustomerId: newCustomer.internal_id,
			currency: "usd",
		},
		updateCustomerProducts: [
			{
				customerProduct: product({ id: "cp_updated" }),
				updates: { status: CusProductStatus.Expired },
			},
		],
		deleteCustomerProducts: [product({ id: "cp_deleted" })],
		updateCustomerEntitlements: [
			{
				customerEntitlement: firstGrantOf(product({ id: "cp_updated" })),
				balanceChange: 3,
			},
		],
	});
};

describe("autumnBillingPlanToPlanOps", () => {
	test("every facet lands in the order the Postgres lane writes it", () => {
		expect(
			described(
				autumnBillingPlanToPlanOps({ autumnBillingPlan: everyFacetPlan() }),
			),
		).toEqual([
			"insert:customer:cus_test",
			"update:customer:cus_internal_test",
			"insert:customerEntitlements:grant_loose",
			"delete:customerPrices:cus_price_cp_patched",
			"insert:entity:ent_1",
			"insert:customerProducts:cp_inserted",
			"insert:customerPrices:cus_price_cp_inserted",
			"insert:customerEntitlements:grant_cp_inserted",
			"update:customer:cus_internal_test",
			"update:customerProducts:cp_updated",
			"delete:customerProducts:cp_deleted",
			"increment:customerEntitlements:grant_cp_updated",
		]);
	});

	test("a plan that writes nothing the worker holds converts to no ops", () => {
		expect(
			autumnBillingPlanToPlanOps({
				autumnBillingPlan: planOf({ lineItems: [], customLineItems: [] }),
			}),
		).toEqual([]);
	});

	test("a create inserts the customer, then the product before the rows that reference it", () => {
		expect(
			described(
				autumnBillingPlanToPlanOps({ autumnBillingPlan: createCustomerPlan() }),
			),
		).toEqual([
			"insert:customer:cus_test",
			"insert:customerProducts:cus_prod_default",
			"insert:customerEntitlements:cus_ent_messages",
		]);
	});

	test("a link-back sets only the columns it defines", () => {
		expect(
			autumnBillingPlanToPlanOps({ autumnBillingPlan: linkBackPlan() }),
		).toEqual([
			{
				op: "update",
				table: "customerProducts",
				id: "cus_prod_default",
				set: { subscription_ids: ["sub_1"] },
			},
		]);
		expect(
			autumnBillingPlanToPlanOps({
				autumnBillingPlan: {
					...linkBackPlan(),
					updateCustomerProducts: [
						{
							customerProduct: defaultProduct(),
							updates: { subscription_ids: undefined },
						},
					],
				},
			}),
		).toEqual([]);
	});
});
