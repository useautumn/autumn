import {
	type AttachParamsV1,
	type FullCustomer,
	getTargetSubscriptionCusProduct,
	InternalError,
	type MultiAttachParamsV0,
	type Product,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { createStripeCli } from "@server/external/connect/createStripeCli";
import type { StripeSubscriptionWithDiscounts } from "@server/external/stripe/subscriptions";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { isStripeSubscriptionCanceled } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";

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
	// newBillingSubscription,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	product?: Product;
	targetCusProductId?: string;
	// newBillingSubscription?: boolean;
	params?: AttachParamsV1 | MultiAttachParamsV0 | UpdateSubscriptionV1Params;
}): Promise<StripeSubscriptionWithDiscounts | undefined> => {
	if (
		params &&
		"new_billing_subscription" in params &&
		params.new_billing_subscription
	) {
		return undefined;
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

	if (!subId) return undefined;

	const sub = await stripeCli.subscriptions.retrieve(subId, {
		expand: [
			"discounts.source.coupon.applies_to",
			"latest_invoice.lines.data.discount_amounts",
		],
	});

	if (!sub) {
		throw new InternalError({
			message: `[Stripe Subscription] Subscription not found: ${subId}`,
		});
	}

	if (isStripeSubscriptionCanceled(sub)) {
		throw new InternalError({
			message: `[Stripe Subscription] Subscription is canceled: ${subId}`,
		});
	}

	if (sub.customer !== fullCus.processor.id) {
		throw new InternalError({
			message: `[Stripe Subscription] Subscription is not for the current customer: ${subId}`,
		});
	}

	return sub as StripeSubscriptionWithDiscounts;
};
