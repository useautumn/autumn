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
}: {
	ctx: AutumnContext;
	billingContext:
		| AttachBillingContext
		| MultiAttachBillingContext
		| UpdateSubscriptionBillingContext;
	billingPlan: BillingPlan;
}): Promise<AttachPreviewResponse> => {
	const basePreview = await billingPlanToPreviewResponse({
		ctx,
		billingContext,
		billingPlan,
	});

	const willRedirectToCheckout =
		billingContext.checkoutMode === "stripe_checkout" ||
		billingContext.checkoutMode === "autumn_checkout";

	const checkoutType =
		billingContext.checkoutMode === "stripe_checkout"
			? "stripe_checkout"
			: billingContext.checkoutMode === "autumn_checkout"
				? "autumn_checkout"
				: null;

	return {
		...basePreview,
		object: "attach_preview" as const,
		redirect_to_checkout: willRedirectToCheckout,
		checkout_type: checkoutType,
	} satisfies AttachPreviewResponse;
};
