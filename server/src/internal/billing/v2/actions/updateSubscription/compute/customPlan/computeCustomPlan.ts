import type {
	AutumnBillingPlan,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import {
	CusProductStatus,
	type UpdateSubscriptionV0Params,
} from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { computeDeleteCustomerProduct } from "@/internal/billing/v2/actions/updateSubscription/compute/computeDeleteCustomerProduct";
import { computeCustomPlanNewCustomerProduct } from "@/internal/billing/v2/actions/updateSubscription/compute/customPlan/computeCustomPlanNewCustomerProduct";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";

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

	const { allLineItems } = buildAutumnLineItems({
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
		lineItems: allLineItems,
	} satisfies AutumnBillingPlan;
};
