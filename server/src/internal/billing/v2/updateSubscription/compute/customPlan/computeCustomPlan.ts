import {
	CusProductStatus,
	type UpdateSubscriptionV0Params,
} from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import type { UpdateSubscriptionBillingContext } from "@server/internal/billing/v2/billingContext";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/billingPlan";
import { computeDeleteCustomerProduct } from "@/internal/billing/v2/updateSubscription/compute/computeDeleteCustomerProduct";
import { computeCustomPlanNewCustomerProduct } from "@/internal/billing/v2/updateSubscription/compute/customPlan/computeCustomPlanNewCustomerProduct";

export const computeCustomPlan = async ({
	ctx,
	updateSubscriptionContext,
	params,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV0Params;
}) => {
	const {
		customerProduct,
		customPrices,
		customEnts,
		trialContext,
		fullCustomer,
	} = updateSubscriptionContext;

	const customFullProduct = updateSubscriptionContext.fullProducts[0];

	// Compute the new customer product
	const newFullCustomerProduct = computeCustomPlanNewCustomerProduct({
		ctx,
		updateSubscriptionContext,
		fullProduct: customFullProduct,
		currentCustomerProduct: customerProduct,
	});

	const lineItems = buildAutumnLineItems({
		ctx,
		newCustomerProducts: [newFullCustomerProduct],
		deletedCustomerProduct: customerProduct,
		billingContext: updateSubscriptionContext,
	});

	// If customer product is canceling, compute the scheduled product to delete
	const deleteCustomerProduct = computeDeleteCustomerProduct({
		fullCustomer,
		customerProduct,
	});

	return {
		insertCustomerProducts: [newFullCustomerProduct],
		updateCustomerProduct: {
			customerProduct,
			updates: {
				status: CusProductStatus.Expired,
			},
		},
		deleteCustomerProduct,
		customPrices,
		customEntitlements: customEnts,
		customFreeTrial: trialContext?.customFreeTrial,
		lineItems,
	} satisfies AutumnBillingPlan;
};
