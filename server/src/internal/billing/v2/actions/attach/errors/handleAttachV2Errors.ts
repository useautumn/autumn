import type { AttachBillingContext, AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleAttachInvoiceModeErrors } from "@/internal/billing/v2/actions/attach/errors/handleAttachInvoiceModeErrors";
import { handleStripeCheckoutErrors } from "@/internal/billing/v2/actions/attach/errors/handleStripeCheckoutErrors";
import { handleExternalPSPErrors } from "@/internal/billing/v2/common/errors/handleExternalPSPErrors";

/**
 * Validates attach v2 request before executing the billing plan.
 */
export const handleAttachV2Errors = ({
	ctx: _ctx,
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
};
