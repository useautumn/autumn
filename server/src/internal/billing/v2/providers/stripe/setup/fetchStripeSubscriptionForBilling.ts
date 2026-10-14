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
import type Stripe from "stripe";

export interface StripeSubscriptionForBilling {
	stripeSubscription?: StripeSubscriptionWithDiscounts;
	canceledStripeSubscriptionId?: string;
	canceledStripeSubscription?: Stripe.Subscription;
	mismatchedStripeSubscriptionId?: string;
}

const neverWritesToStripeSubscription = (
	params?: AttachParamsV1 | MultiAttachParamsV0 | UpdateSubscriptionV1Params,
) => {
	if (params === undefined) return false;

	const isImmediateCancel =
		"cancel_action" in params && params.cancel_action === "cancel_immediately";
	const isNoBillingChanges =
		"no_billing_changes" in params && params.no_billing_changes === true;

	return isImmediateCancel || isNoBillingChanges;
};

const isTerminalStripeSubscription = (subscription: Stripe.Subscription) =>
	subscription.status === "canceled" ||
	subscription.status === "incomplete_expired";

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

	if (sub.customer !== fullCus.processor?.id) {
		if (neverWritesToStripeSubscription(params)) {
			return { mismatchedStripeSubscriptionId: subId };
		}

		throw new RecaseError({
			message: `Subscription ${subId} is not for the current customer`,
			statusCode: 400,
		});
	}

	if (isTerminalStripeSubscription(sub)) {
		return {
			canceledStripeSubscriptionId: subId,
			canceledStripeSubscription: sub,
		};
	}

	return { stripeSubscription: sub as StripeSubscriptionWithDiscounts };
};
