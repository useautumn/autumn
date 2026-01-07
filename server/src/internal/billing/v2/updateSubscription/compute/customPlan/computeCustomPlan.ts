import {
	CusProductStatus,
	cusProductToProduct,
	secondsToMs,
	type UpdateSubscriptionV0Params,
} from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import type { UpdateSubscriptionBillingContext } from "@server/internal/billing/v2/billingContext";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import { computeCustomPlanFreeTrial } from "@/internal/billing/v2/updateSubscription/compute/customPlan/computeCustomPlanFreeTrial";
import { computeCustomPlanNewCustomerProduct } from "@/internal/billing/v2/updateSubscription/compute/customPlan/computeCustomPlanNewCustomerProduct";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/billingPlan";
import { computeCustomFullProduct } from "../../../compute/computeAutumnUtils/computeCustomFullProduct";

export const computeCustomPlan = async ({
	ctx,
	updateSubscriptionContext,
	params,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV0Params;
}) => {
	const { customerProduct, stripeSubscription } = updateSubscriptionContext;

	const currentFullProduct = cusProductToProduct({
		cusProduct: customerProduct,
	});

	const {
		fullProduct: customFullProduct,
		customPrices,
		customEnts,
	} = await computeCustomFullProduct({
		ctx,
		currentFullProduct,
		customItems: params.items,
	});

	updateSubscriptionContext.fullProducts = [customFullProduct];

	// 2. Compute the custom trial details
	const { freeTrialPlan, customFreeTrial } = computeCustomPlanFreeTrial({
		updateSubscriptionContext,
		params,
		fullProduct: customFullProduct,
	});

	updateSubscriptionContext.billingCycleAnchorMs =
		freeTrialPlan.trialEndsAt ??
		secondsToMs(stripeSubscription?.billing_cycle_anchor);

	// 3. Compute the new customer product
	const newFullCustomerProduct = computeCustomPlanNewCustomerProduct({
		ctx,
		updateSubscriptionContext,
		params,
		fullProduct: customFullProduct,
		freeTrialPlan,
	});

	const lineItems = buildAutumnLineItems({
		ctx,
		newCustomerProducts: [newFullCustomerProduct],
		deletedCustomerProduct: customerProduct,
		billingContext: updateSubscriptionContext,
	});

	return {
		insertCustomerProducts: [newFullCustomerProduct],
		updateCustomerProduct: {
			...customerProduct,
			status: CusProductStatus.Expired,
		},
		customPrices: customPrices,
		customEntitlements: customEnts,
		customFreeTrial: customFreeTrial,
		lineItems,
	} satisfies AutumnBillingPlan;
};
