import { expect, test } from "bun:test";
import type {
	FullCusProduct,
	FullCustomerEntitlement,
	PooledBalancePlan,
} from "@autumn/shared";
import { applyPooledBalancePlanToIncomingCustomerProducts } from "@/internal/billing/v2/pooledBalances/compute/applyPooledBalancePlanToIncomingCustomerProducts";

test("normalizes incoming pooled source entitlements from the finalized plan", () => {
	const sourceCustomerEntitlement = {
		id: "source-entitlement",
		balance: 100,
		adjustment: 10,
		additional_balance: 5,
		entities: { entity: { balance: 100 } },
		pooled_balance_id: "old-pool",
		pooled_contribution_id: null,
	} as unknown as FullCustomerEntitlement;
	const customerProduct = {
		customer_entitlements: [sourceCustomerEntitlement],
	} as FullCusProduct;
	const pooledBalancePlan = {
		insertPoolBalances: [],
		updatePoolBalances: [],
		insertPoolContributions: [
			{
				id: "contribution",
				pooled_balance_id: "pool",
				source_customer_product_id: "customer-product",
				source_customer_entitlement_id: sourceCustomerEntitlement.id,
				current_contribution: 100,
				next_cycle_contribution: 100,
				effective_at: null,
				created_at: 1,
				updated_at: 1,
			},
		],
		updatePoolContributions: [],
		deletePoolContributions: [],
	} satisfies PooledBalancePlan;

	applyPooledBalancePlanToIncomingCustomerProducts({
		customerProducts: [customerProduct],
		pooledBalancePlan,
	});

	expect(customerProduct.customer_entitlements[0]).toMatchObject({
		pooled_contribution_id: "contribution",
		pooled_balance_id: null,
		balance: 0,
		adjustment: 0,
		additional_balance: 0,
		entities: null,
	});
});
