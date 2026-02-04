import type { AttachBillingContext, AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleAttachInvoiceModeErrors } from "@/internal/billing/v2/actions/attach/errors/handleAttachInvoiceModeErrors";
import { handleScheduledSwitchOneOffErrors } from "@/internal/billing/v2/actions/attach/errors/handleScheduledSwitchOneOffErrors";
import { handleStripeCheckoutErrors } from "@/internal/billing/v2/actions/attach/errors/handleStripeCheckoutErrors";
import { handleTransitionConfigErrors } from "@/internal/billing/v2/actions/attach/errors/handleTransitionConfigErrors";
import { handleExternalPSPErrors } from "@/internal/billing/v2/common/errors/handleExternalPSPErrors";

/**
 * Validates attach v2 request before executing the billing plan.
 */
export const handleAttachV2Errors = ({
	ctx,
	billingContext,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	billingContext: AttachBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	// 1. External PSP errors (RevenueCat)
	handleExternalPSPErrors({
		customerProduct: billingContext.currentCustomerProduct,
		action: "attach",
	});

	// 2. Stripe checkout errors (multi-interval)
	handleStripeCheckoutErrors({ billingContext, autumnBillingPlan });

	// 3. Invoice mode errors (deferred + downgrade)
	handleAttachInvoiceModeErrors({ billingContext });

	// 4. Scheduled switch to mixed recurring + one-off products
	handleScheduledSwitchOneOffErrors({ billingContext });

	// 5. Transition config errors (reset_after_trial_end on allocated features)
	handleTransitionConfigErrors({ ctx, billingContext });
};
