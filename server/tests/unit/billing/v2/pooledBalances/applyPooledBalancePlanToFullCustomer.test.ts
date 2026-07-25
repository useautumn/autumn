import { expect, test } from "bun:test";
import type {
	AutumnBillingPlan,
	FullCusProduct,
	FullCustomer,
	FullCustomerEntitlement,
} from "@autumn/shared";
import { applyAutumnBillingPlanToFullCustomer } from "@/internal/billing/v2/utils/autumnBillingPlanToFinalFullCustomer";

test("projects pooled balance and contribution operations onto the final customer", () => {
	const sourceCustomerEntitlement = {
		id: "source-entitlement",
		balance: 100,
		adjustment: 10,
		additional_balance: 5,
		entities: { entity: { balance: 100 } },
		pooled_balance_id: null,
		pooled_contribution_id: null,
	} as unknown as FullCustomerEntitlement;
	const customerProduct = {
		id: "customer-product",
		customer_entitlements: [sourceCustomerEntitlement],
	} as FullCusProduct;
	const fullCustomer = {
		customer_products: [customerProduct],
		pooled_customer_entitlements: [],
	} as unknown as FullCustomer;
	const pooledCustomerEntitlement = {
		id: "pooled-customer-entitlement",
		balance: 100,
		pooled_balance: { id: "pool", granted: 100 },
	} as unknown as FullCustomerEntitlement;
	const contribution = {
		id: "contribution",
		pooled_balance_id: "pool",
		source_customer_product_id: customerProduct.id,
		source_customer_entitlement_id: sourceCustomerEntitlement.id,
		current_contribution: 100,
		next_cycle_contribution: 100,
		effective_at: null,
		created_at: 1,
		updated_at: 1,
	};
	const autumnBillingPlan = {
		customerId: "customer",
		insertCustomerProducts: [],
		pooledBalancePlan: {
			insertPoolBalances: [pooledCustomerEntitlement],
			updatePoolBalances: [],
			insertPoolContributions: [contribution],
			updatePoolContributions: [],
			deletePoolContributions: [],
		},
	} satisfies AutumnBillingPlan;

	const result = applyAutumnBillingPlanToFullCustomer({
		fullCustomer,
		autumnBillingPlan,
	});

	expect(result.customer_products[0].customer_entitlements[0]).toMatchObject({
		pooled_contribution_id: contribution.id,
		pooled_balance_id: null,
		balance: 0,
		adjustment: 0,
		additional_balance: 0,
		entities: null,
		pooled_balance_contribution: contribution,
	});
	expect(result.pooled_customer_entitlements).toEqual([
		pooledCustomerEntitlement,
	]);
	expect(sourceCustomerEntitlement.balance).toBe(100);
	expect(sourceCustomerEntitlement.pooled_contribution_id).toBeNull();
});
