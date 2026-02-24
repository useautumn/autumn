import type {
	AttachBillingContext,
	AttachParamsV1,
	BillingPlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleAttachInvoiceModeErrors } from "@/internal/billing/v2/actions/attach/errors/handleAttachInvoiceModeErrors";
import { handleCurrentCustomerProductErrors } from "@/internal/billing/v2/actions/attach/errors/handleCurrentCustomerProductErrors";
import { handleNewBillingSubscriptionErrors } from "@/internal/billing/v2/actions/attach/errors/handleNewBillingSubscriptionErrors";
import { handleScheduledSwitchOneOffErrors } from "@/internal/billing/v2/actions/attach/errors/handleScheduledSwitchOneOffErrors";
import { handleStripeCheckoutErrors } from "@/internal/billing/v2/actions/attach/errors/handleStripeCheckoutErrors";
import { handleTransitionConfigErrors } from "@/internal/billing/v2/actions/attach/errors/handleTransitionConfigErrors";
import { handleProrationBehaviorErrors } from "@/internal/billing/v2/common/errors/handleBillingBehaviorErrors";
import { handleExternalPSPErrors } from "@/internal/billing/v2/common/errors/handleExternalPSPErrors";

/** Validates attach v2 request before executing the billing plan. */
export const handleAttachV2Errors = ({
	ctx,
	billingContext,
	billingPlan,
	params,
}: {
	ctx: AutumnContext;
	billingContext: AttachBillingContext;
	billingPlan: BillingPlan;
	params: AttachParamsV1;
}) => {
	const { autumn: autumnBillingPlan } = billingPlan;

	// 1. External PSP errors (RevenueCat)
	handleExternalPSPErrors({
		customerProduct: billingContext.currentCustomerProduct,
		action: "attach",
	});

	// 2. Current customer product errors (same product)
	handleCurrentCustomerProductErrors({ billingContext });

	// 3. new_billing_subscription validation errors
	handleNewBillingSubscriptionErrors({ billingContext, params });

	// 4. Stripe checkout errors (multi-interval)
	handleStripeCheckoutErrors({ billingContext, autumnBillingPlan });

	// 5. Invoice mode errors (deferred + downgrade)
	handleAttachInvoiceModeErrors({ billingContext });

	// 6. Scheduled switch to mixed recurring + one-off products
	handleScheduledSwitchOneOffErrors({ billingContext });

	// 7. Transition config errors (reset_after_trial_end on allocated features)
	handleTransitionConfigErrors({ ctx, billingContext });

	// 8. Proration behavior errors (none restrictions)
	handleProrationBehaviorErrors({
		billingContext,
		currentCustomerProduct: billingContext.currentCustomerProduct,
		billingPlan,
		params,
	});
};
