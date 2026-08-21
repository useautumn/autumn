import { expect, test } from "bun:test";
import type {
	AttachBillingContext,
	AttachParamsV1,
	AutumnBillingPlan,
	BalanceTransitionPlan,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { computeAttachBalanceTransitionPlan } from "@/internal/billing/v2/actions/attach/compute/computeAttachBalanceTransitionPlan.js";

test("rejects publication when execution resets a transition source", () => {
	const sourceCustomerEntitlement = customerEntitlements.create({
		id: "source_messages",
		customerProductId: "source_product",
		featureId: "messages",
		featureName: "Messages",
		allowance: 100,
		balance: 90,
	});
	const sourceCustomerProduct = customerProducts.create({
		id: "source_product",
		customerEntitlements: [sourceCustomerEntitlement],
	});
	const balanceTransitionPlan: BalanceTransitionPlan = {
		id: "target_product",
		outgoingCustomerEntitlements: [sourceCustomerEntitlement],
		transitions: [
			{
				sourceCustomerEntitlementId: sourceCustomerEntitlement.id,
				targetCustomerEntitlementId: "target_messages",
				sourceBalance: 90,
				sourceAdjustment: 0,
			},
		],
	};
	const autumnBillingPlan: AutumnBillingPlan = {
		customerId: "customer_123",
		insertCustomerProducts: [],
		updateCustomerEntitlements: [
			{
				customerEntitlement: sourceCustomerEntitlement,
				updates: { balance: 100, adjustment: 0 },
			},
		],
	};

	const result = computeAttachBalanceTransitionPlan({
		attachBillingContext: {
			currentCustomerProduct: sourceCustomerProduct,
			carryOverSourceCustomerProduct: sourceCustomerProduct,
		} as AttachBillingContext,
		params: {} as AttachParamsV1,
		balanceTransitionPlan,
		autumnBillingPlan,
		hasFullCustomerOverride: false,
	});

	expect(result?.unsupportedReason).toBe("source_customer_entitlement_update");
});
