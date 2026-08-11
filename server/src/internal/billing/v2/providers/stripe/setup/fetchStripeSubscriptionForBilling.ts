import {
	type AttachParamsV1,
	type FullCustomer,
	getTargetSubscriptionCusProduct,
	type MultiAttachParamsV0,
	type Product,
	RecaseError,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { createStripeCli } from "@server/external/connect/createStripeCli";
import type { StripeSubscriptionWithDiscounts } from "@server/external/stripe/subscriptions";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { isStripeSubscriptionCanceled } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";

export interface StripeSubscriptionForBilling {
	stripeSubscription?: StripeSubscriptionWithDiscounts;
	/** Set when the linked subscription exists in Stripe but is already canceled. */
	canceledStripeSubscriptionId?: string;
	/** Set when the linked subscription belongs to a different Stripe customer.
	 *  Only surfaced for flows allowed to proceed past that fault. */
	mismatchedStripeSubscriptionId?: string;
}

/** An immediate cancel only detaches Autumn-side state, so a subscription it
 *  will never touch must not block it. */
const isImmediateCancelRequest = (
	params?: AttachParamsV1 | MultiAttachParamsV0 | UpdateSubscriptionV1Params,
) =>
	params !== undefined &&
	"cancel_action" in params &&
	params.cancel_action === "cancel_immediately";

/**
 * Fetches a Stripe subscription with expanded discounts for billing operations.
 * Returns the subscription with `discounts.source.coupon.applies_to` expanded.
 */
export const fetchStripeSubscriptionForBilling = async ({
	ctx,
	fullCus,
	product,
	targetCusProductId,
	params,
	newBillingSubscription,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	product?: Product;
	targetCusProductId?: string;
	newBillingSubscription?: boolean;
	params?: AttachParamsV1 | MultiAttachParamsV0 | UpdateSubscriptionV1Params;
}): Promise<StripeSubscriptionForBilling> => {
	if (newBillingSubscription) {
		return {};
	}

	const processorSubscriptionId =
		params && "processor_subscription_id" in params
			? params.processor_subscription_id
			: undefined;

	const { org, env } = ctx;
	const stripeCli = createStripeCli({ org, env });

	const cusProductWithSub = getTargetSubscriptionCusProduct({
		fullCus,
		productId: product?.id ?? "",
		productGroup: product?.group ?? "",
		cusProductId: targetCusProductId,
	});

	const subId =
		processorSubscriptionId ?? cusProductWithSub?.subscription_ids?.[0];

	if (!subId) return {};

	const sub = await stripeCli.subscriptions.retrieve(subId, {
		expand: ["discounts.source.coupon.applies_to"],
	});

	if (!sub) {
		throw new RecaseError({
			message: `Subscription ${subId} not found`,
			statusCode: 404,
		});
	}

	// Wrong-customer linkage is a data fault worth surfacing, except to an
	// immediate cancel — blocking that would strand the plan with no way out.
	if (sub.customer !== fullCus.processor.id) {
		if (isImmediateCancelRequest(params)) {
			return { mismatchedStripeSubscriptionId: subId };
		}

		throw new RecaseError({
			message: `Subscription ${subId} is not for the current customer`,
			statusCode: 400,
		});
	}

	// A canceled sub carries no live billing state. Report it separately so each
	// caller decides: abandon it (attach) or block Stripe writes (updateSubscription).
	if (isStripeSubscriptionCanceled(sub)) {
		return { canceledStripeSubscriptionId: subId };
	}

	return { stripeSubscription: sub as StripeSubscriptionWithDiscounts };
};
