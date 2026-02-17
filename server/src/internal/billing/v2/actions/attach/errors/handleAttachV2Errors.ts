import type {
	AttachBillingContext,
	AttachParamsV0,
	BillingPlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleAttachInvoiceModeErrors } from "@/internal/billing/v2/actions/attach/errors/handleAttachInvoiceModeErrors";
import { handleCurrentCustomerProductErrors } from "@/internal/billing/v2/actions/attach/errors/handleCurrentCustomerProductErrors";
import { handleScheduledSwitchOneOffErrors } from "@/internal/billing/v2/actions/attach/errors/handleScheduledSwitchOneOffErrors";
import { handleStripeCheckoutErrors } from "@/internal/billing/v2/actions/attach/errors/handleStripeCheckoutErrors";
import { handleTransitionConfigErrors } from "@/internal/billing/v2/actions/attach/errors/handleTransitionConfigErrors";
import { handleBillingBehaviorErrors } from "@/internal/billing/v2/common/errors/handleBillingBehaviorErrors";
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
	params: AttachParamsV0;
}) => {
	const { autumn: autumnBillingPlan } = billingPlan;

	// 1. External PSP errors (RevenueCat)
	handleExternalPSPErrors({
		customerProduct: billingContext.currentCustomerProduct,
		action: "attach",
	});

	// 2. Current customer product errors (same product)
	handleCurrentCustomerProductErrors({ billingContext });

	// 3. Stripe checkout errors (multi-interval)
	handleStripeCheckoutErrors({ billingContext, autumnBillingPlan });

	// 4. Invoice mode errors (deferred + downgrade)
	handleAttachInvoiceModeErrors({ billingContext });

	// 5. Scheduled switch to mixed recurring + one-off products
	handleScheduledSwitchOneOffErrors({ billingContext });

	// 6. Transition config errors (reset_after_trial_end on allocated features)
	handleTransitionConfigErrors({ ctx, billingContext });

	// 7. Billing behavior errors (next_cycle_only restrictions)
	handleBillingBehaviorErrors({
		billingContext,
		currentCustomerProduct: billingContext.currentCustomerProduct,
		billingPlan,
		billingBehavior: params.billing_behavior,
	});
};
