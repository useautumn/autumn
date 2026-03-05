import type {
	AutumnBillingPlan,
	UpdateSubscriptionBillingContext,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { CusProductStatus } from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { computeDeleteCustomerProduct } from "@/internal/billing/v2/actions/updateSubscription/compute/computeDeleteCustomerProduct";
import { computeCustomPlanNewCustomerProduct } from "@/internal/billing/v2/actions/updateSubscription/compute/customPlan/computeCustomPlanNewCustomerProduct";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";

export const computeCustomPlan = async ({
	ctx,
	params,
	updateSubscriptionContext,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
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
		params,
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
		customerId: fullCustomer?.id ?? "",
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
