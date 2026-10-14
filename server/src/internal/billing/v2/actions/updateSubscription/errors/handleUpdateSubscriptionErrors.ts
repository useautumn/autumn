import type {
	BillingPlan,
	UpdateSubscriptionBillingContext,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleCancelEndOfCycleErrors } from "@/internal/billing/v2/actions/updateSubscription/errors/handleCancelEndOfCycleErrors";
import { handleProrationBehaviorErrors } from "@/internal/billing/v2/common/errors/handleBillingBehaviorErrors";
import { handleExternalPSPErrors } from "@/internal/billing/v2/common/errors/handleExternalPSPErrors";
import { handleRevertTrialErrors } from "@/internal/billing/v2/common/errors/handleRevertTrialErrors";
import { handleStripeBillingPlanErrors } from "@/internal/billing/v2/providers/stripe/errors/handleStripeBillingPlanErrors";
import { computeFieldUpdates } from "../compute/computeFieldUpdates.js";
import { handleAutumnManagedTrialInvoiceModeErrors } from "./handleAutumnManagedTrialInvoiceModeErrors.js";
import { handleCurrentCustomerProductErrors } from "./handleCurrentCustomerProductErrors.js";
import { handleCustomPlanErrors } from "./handleCustomPlanErrors.js";
import { handleManualTopUpErrors } from "./handleManualTopUpErrors.js";
import {
	checkTrialRemovalWithOneOffItems,
	handleOneOffErrors,
} from "./handleOneOffErrors.js";
import { handleProductTypeTransitionErrors } from "./handleProductTypeTransitionErrors.js";
import { handleUncancelErrors } from "./handleUncancelErrors.js";
import { handleUpdateCheckoutErrors } from "./handleUpdateCheckoutErrors.js";
import { handleUpdateSubscriptionBillingCycleAnchorErrors } from "./handleUpdateSubscriptionBillingCycleAnchorErrors.js";
import { handleUpdateSubscriptionCustomLineItemsErrors } from "./handleUpdateSubscriptionCustomLineItemsErrors.js";
import { handleUpdateSubscriptionLicenseErrors } from "./handleUpdateSubscriptionLicenseErrors.js";

export const handleUpdateSubscriptionErrors = async ({
	ctx,
	billingContext,
	billingPlan,
	params,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	billingPlan: BillingPlan;
	params: UpdateSubscriptionV1Params;
}) => {
	const { customerProduct } = billingContext;

	const { autumn: autumnBillingPlan } = billingPlan;

	handleExternalPSPErrors({
		customerProduct,
		action: "update",
		cancelAction: params.cancel_action,
		noBillingChanges: params.no_billing_changes,
		intent: billingContext.intent,
		hasFieldUpdates: Object.keys(computeFieldUpdates({ params })).length > 0,
	});

	handleCurrentCustomerProductErrors({ billingContext });

	handleRevertTrialErrors({
		billingContext,
		updatedCustomerProduct: customerProduct,
	});

	handleAutumnManagedTrialInvoiceModeErrors({ billingContext });

	handleProductTypeTransitionErrors({ billingContext, autumnBillingPlan });

	handleCustomPlanErrors({ ctx, billingContext, autumnBillingPlan, params });

	handleUpdateSubscriptionLicenseErrors({
		billingContext,
		params,
	});

	handleManualTopUpErrors({ billingContext, params });
	handleUpdateSubscriptionCustomLineItemsErrors({
		billingContext,
		billingPlan,
		params,
	});

	handleOneOffErrors({ ctx, billingContext, autumnBillingPlan, params });

	checkTrialRemovalWithOneOffItems({ billingContext, autumnBillingPlan });

	handleCancelEndOfCycleErrors({ billingContext, billingPlan });

	handleUncancelErrors({ billingContext });

	handleProrationBehaviorErrors({
		billingContext,
		billingPlan,
	});

	handleUpdateSubscriptionBillingCycleAnchorErrors({ billingContext });

	handleUpdateCheckoutErrors({ billingContext });

	handleStripeBillingPlanErrors({ ctx, billingContext, billingPlan });
};
