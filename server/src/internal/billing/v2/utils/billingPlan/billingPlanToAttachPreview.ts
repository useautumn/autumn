import type {
	AttachBillingContext,
	AttachPreviewResponse,
	BillingPlan,
	MultiAttachBillingContext,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingPlanToPreviewResponse } from "../billingPlanToPreviewResponse";

export const billingPlanToAttachPreview = async ({
	ctx,
	billingContext,
	billingPlan,
	nextCycleStripeSubscriptionId,
}: {
	ctx: AutumnContext;
	billingContext:
		| AttachBillingContext
		| MultiAttachBillingContext
		| UpdateSubscriptionBillingContext;
	billingPlan: BillingPlan;
	/** Scope next_cycle to the plans this Stripe subscription's next invoice bills. */
	nextCycleStripeSubscriptionId?: string;
}): Promise<AttachPreviewResponse> => {
	const { credit_applied, ...basePreview } = await billingPlanToPreviewResponse(
		{
			ctx,
			billingContext,
			billingPlan,
			nextCycleStripeSubscriptionId,
		},
	);

	const willRedirectToCheckout =
		billingContext.checkoutMode === "stripe_checkout" ||
		billingContext.checkoutMode === "autumn_checkout";

	const checkoutType =
		billingContext.checkoutMode === "stripe_checkout"
			? "stripe_checkout"
			: billingContext.checkoutMode === "autumn_checkout"
				? "autumn_checkout"
				: null;

	const invoiceCredits = billingPlan.preview?.invoiceCredits;

	return {
		...basePreview,
		object: "attach_preview" as const,
		redirect_to_checkout: willRedirectToCheckout,
		checkout_type: checkoutType,
		tax: billingPlan.preview?.tax,
		// total already nets the credit off, so applied just explains the gap.
		invoice_credits: invoiceCredits
			? { ...invoiceCredits, applied: credit_applied }
			: undefined,
	} satisfies AttachPreviewResponse;
};
