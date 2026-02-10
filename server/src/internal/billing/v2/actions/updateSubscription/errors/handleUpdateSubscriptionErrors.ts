import type {
	BillingPlan,
	UpdateSubscriptionBillingContext,
	UpdateSubscriptionV0Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleCancelEndOfCycleErrors } from "@/internal/billing/v2/actions/updateSubscription/errors/handleCancelEndOfCycleErrors";
import { handleExternalPSPErrors } from "@/internal/billing/v2/common/errors/handleExternalPSPErrors";
import { handleStripeBillingPlanErrors } from "@/internal/billing/v2/providers/stripe/errors/handleStripeBillingPlanErrors";
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
	billingPlan,
	params,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	billingPlan: BillingPlan;
	params: UpdateSubscriptionV0Params;
}) => {
	const { customerProduct } = billingContext;

	const { autumn: autumnBillingPlan } = billingPlan;

	// 1. External PSP errors (RevenueCat)
	handleExternalPSPErrors({
		customerProduct,
		action: "update",
	});

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
	handleCancelEndOfCycleErrors({ billingContext, billingPlan });

	// 8. Uncancel validation errors
	handleUncancelErrors({ billingContext });

	// 9. Billing behavior errors
	handleBillingBehaviorErrors({
		billingContext,
		billingPlan,
		params,
	});

	// 11. Stripe billing plan errors (validate Stripe resources)
	handleStripeBillingPlanErrors({ billingContext });
};
