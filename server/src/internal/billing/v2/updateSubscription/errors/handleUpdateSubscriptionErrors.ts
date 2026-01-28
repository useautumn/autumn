import {
	ProcessorType,
	RecaseError,
	type UpdateSubscriptionV0Params,
} from "@autumn/shared";
import { cusProductToProcessorType } from "@shared/utils/cusProductUtils/convertCusProduct";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleStripeBillingPlanErrors } from "@/internal/billing/v2/providers/stripe/errors/handleStripeBillingPlanErrors";
import type {
	AutumnBillingPlan,
	UpdateSubscriptionBillingContext,
} from "@/internal/billing/v2/types";
import { handleCancelEndOfCycleErrors } from "@/internal/billing/v2/updateSubscription/errors/handleCancelEndOfCycleErrors";
import { handleBillingBehaviorErrors } from "./handleBillingBehaviorErrors";
import { handleCurrentCustomerProductErrors } from "./handleCurrentCustomerProductErrors";
import { handleCustomPlanErrors } from "./handleCustomPlanErrors";
import { handleFeatureQuantityErrors } from "./handleFeatureQuantityErrors";
import {
	checkTrialRemovalWithOneOffItems,
	handleOneOffErrors,
} from "./handleOneOffErrors";
import { handleProductTypeTransitionErrors } from "./handleProductTypeTransitionErrors";

import { handleUncancelErrors } from "./handleUncancelErrors";

export const handleUpdateSubscriptionErrors = async ({
	ctx,
	billingContext,
	autumnBillingPlan,
	params,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
	params: UpdateSubscriptionV0Params;
}) => {
	const { customerProduct } = billingContext;

	// 1. RevenueCat error
	if (cusProductToProcessorType(customerProduct) === ProcessorType.RevenueCat) {
		throw new RecaseError({
			message: `Cannot update '${customerProduct.product.name}' because it is managed by RevenueCat.`,
		});
	}

	// 1. Current customer product errors
	handleCurrentCustomerProductErrors({ billingContext });

	// 2. Product type transition errors
	handleProductTypeTransitionErrors({ billingContext, autumnBillingPlan });

	// 3. Feature quantity errors (prepaid prices must have options)
	handleFeatureQuantityErrors({
		ctx,
		billingContext,
		autumnBillingPlan,
		params,
	});

	// 4. Custom plan errors
	handleCustomPlanErrors({ ctx, billingContext, autumnBillingPlan, params });

	// 5. One-off errors
	handleOneOffErrors({ ctx, billingContext, autumnBillingPlan, params });

	// 6. Trial removal with one-off items
	checkTrialRemovalWithOneOffItems({ billingContext, autumnBillingPlan });

	// 7. Cancel end of cycle errors
	handleCancelEndOfCycleErrors({ billingContext, params });

	// 8. Uncancel validation errors
	handleUncancelErrors({ billingContext });

	// 9. Billing behavior errors
	handleBillingBehaviorErrors({
		billingContext,
		autumnBillingPlan,
		params,
	});

	// 11. Stripe billing plan errors (validate Stripe resources)
	handleStripeBillingPlanErrors({ billingContext });
};
