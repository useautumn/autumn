/**
 * expandToPlanInstances / planExpandsByQuantity
 *
 * A plan with quantity N becomes N rows only when it carries no purchased
 * units. Each new row replaces one outgoing instance of the replaced plan;
 * outgoing instances left over are superseded by the first row.
 */

import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type SyncPlanInstance,
	type SyncProductContext,
} from "@autumn/shared";
import { expandToPlanInstances } from "@/internal/billing/v2/actions/sync/setup/expandToPlanInstances.js";
import { planExpandsByQuantity } from "@/internal/billing/v2/actions/sync/utils/planExpandsByQuantity.js";

const SUBSCRIPTION_ID = "sub_expand";

const row = ({ id, productId }: { id: string; productId: string }) =>
	({
		id,
		product_id: productId,
		product: { id: productId },
		status: CusProductStatus.Active,
		subscription_ids: [SUBSCRIPTION_ID],
		internal_entity_id: null,
		customer_entitlements: [],
	}) as unknown as FullCusProduct;

const context = ({
	plan,
	current,
	isAddOn = false,
}: {
	plan: SyncPlanInstance;
	current?: FullCusProduct;
	isAddOn?: boolean;
}) =>
	({
		plan,
		fullProduct: { id: plan.plan_id, is_add_on: isAddOn },
		currentCustomerProduct: current,
	}) as unknown as SyncProductContext;

const customerWith = (rows: FullCusProduct[]) =>
	({ customer_products: rows }) as unknown as FullCustomer;

describe("planExpandsByQuantity", () => {
	test("a main plan without purchased units expands", () => {
		expect(
			planExpandsByQuantity({
				plan: { plan_id: "pro", quantity: 2 },
				isAddOn: false,
			}),
		).toBe(true);
	});

	test("a main plan with prepaid quantity stays one row", () => {
		expect(
			planExpandsByQuantity({
				plan: {
					plan_id: "pro",
					quantity: 2,
					feature_quantities: [{ feature_id: "messages", quantity: 500 }],
				},
				isAddOn: false,
			}),
		).toBe(false);
	});

	test("a zero prepaid quantity is not a purchase", () => {
		expect(
			planExpandsByQuantity({
				plan: {
					plan_id: "pro",
					quantity: 2,
					feature_quantities: [{ feature_id: "messages", quantity: 0 }],
				},
				isAddOn: false,
			}),
		).toBe(true);
	});

	test("an add-on always expands", () => {
		expect(
			planExpandsByQuantity({
				plan: {
					plan_id: "addon",
					quantity: 3,
					feature_quantities: [{ feature_id: "messages", quantity: 500 }],
				},
				isAddOn: true,
			}),
		).toBe(true);
	});
});

describe("expandToPlanInstances", () => {
	test("pairs each new row with one outgoing instance", () => {
		const pro1 = row({ id: "cp_pro_1", productId: "pro" });
		const pro2 = row({ id: "cp_pro_2", productId: "pro" });
		const contexts = expandToPlanInstances({
			fullCustomer: customerWith([pro1, pro2]),
			productContext: context({
				plan: { plan_id: "pro", quantity: 2, expire_previous: true },
				current: pro1,
			}),
			stripeSubscriptionId: SUBSCRIPTION_ID,
		});

		expect(contexts.map((c) => c.currentCustomerProduct?.id)).toEqual([
			"cp_pro_1",
			"cp_pro_2",
		]);
		expect(contexts[0].supersededInstances).toEqual([]);
	});

	test("supersedes outgoing instances left over after a plan change", () => {
		const pro1 = row({ id: "cp_pro_1", productId: "pro" });
		const pro2 = row({ id: "cp_pro_2", productId: "pro" });
		const contexts = expandToPlanInstances({
			fullCustomer: customerWith([pro1, pro2]),
			productContext: context({
				plan: { plan_id: "premium", quantity: 1, expire_previous: true },
				current: pro1,
			}),
			stripeSubscriptionId: SUBSCRIPTION_ID,
		});

		expect(contexts).toHaveLength(1);
		expect(contexts[0].currentCustomerProduct?.id).toBe("cp_pro_1");
		expect(contexts[0].supersededInstances?.map((r) => r.id)).toEqual([
			"cp_pro_2",
		]);
	});

	test("a main plan with purchased units stays one row", () => {
		const contexts = expandToPlanInstances({
			fullCustomer: customerWith([]),
			productContext: context({
				plan: {
					plan_id: "pro",
					quantity: 2,
					feature_quantities: [{ feature_id: "messages", quantity: 500 }],
				},
			}),
			stripeSubscriptionId: SUBSCRIPTION_ID,
		});

		expect(contexts).toHaveLength(1);
	});
});
