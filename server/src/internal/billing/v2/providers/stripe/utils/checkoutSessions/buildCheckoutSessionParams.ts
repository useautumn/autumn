import type Stripe from "stripe";
import { buildCheckoutSessionMetadata } from "./buildCheckoutSessionMetadata";

/**
 * Deep-merges subscription_data so user-provided fields (e.g. metadata)
 * are preserved alongside Autumn-internal fields (e.g. trial_end).
 */
const mergeSubscriptionData = ({
	paramsSubscriptionData,
	userSubscriptionData,
}: {
	paramsSubscriptionData?: Stripe.Checkout.SessionCreateParams.SubscriptionData;
	userSubscriptionData?: Stripe.Checkout.SessionCreateParams.SubscriptionData;
}): Stripe.Checkout.SessionCreateParams.SubscriptionData | undefined => {
	if (!paramsSubscriptionData && !userSubscriptionData) {
		return undefined;
	}

	return {
		...(userSubscriptionData ?? {}),
		...(paramsSubscriptionData ?? {}),
		metadata: {
			...(userSubscriptionData?.metadata ?? {}),
			...(paramsSubscriptionData?.metadata ?? {}),
		},
	};
};

export const buildCheckoutSessionParams = ({
	params,
	checkoutSessionParams,
	currency,
	defaultAllowPromotionCodes,
	defaultInvoiceCreation,
	defaultSavedPaymentMethodOptions,
	autumnMetadataId,
}: {
	params: Stripe.Checkout.SessionCreateParams;
	checkoutSessionParams?: Partial<Stripe.Checkout.SessionCreateParams>;
	currency?: string;
	defaultAllowPromotionCodes?: boolean;
	defaultInvoiceCreation?: Stripe.Checkout.SessionCreateParams.InvoiceCreation;
	defaultSavedPaymentMethodOptions?: Stripe.Checkout.SessionCreateParams.SavedPaymentMethodOptions;
	autumnMetadataId?: string;
}): Stripe.Checkout.SessionCreateParams => {
	const mergedParams: Stripe.Checkout.SessionCreateParams = {
		...(checkoutSessionParams ?? {}),
		...params,
	};

	const hasPreAppliedDiscounts = Boolean(mergedParams.discounts?.length);

	return {
		...mergedParams,
		...(currency
			? {
					currency,
				}
			: {}),
		allow_promotion_codes: hasPreAppliedDiscounts
			? undefined
			: (mergedParams.allow_promotion_codes ?? defaultAllowPromotionCodes),
		saved_payment_method_options:
			mergedParams.saved_payment_method_options ??
			defaultSavedPaymentMethodOptions,
		invoice_creation: mergedParams.invoice_creation ?? defaultInvoiceCreation,
		metadata: buildCheckoutSessionMetadata({
			paramsMetadata: params.metadata,
			checkoutSessionMetadata: checkoutSessionParams?.metadata,
			autumnMetadataId,
		}),
		subscription_data: mergeSubscriptionData({
			paramsSubscriptionData: params.subscription_data as
				| Stripe.Checkout.SessionCreateParams.SubscriptionData
				| undefined,
			userSubscriptionData: checkoutSessionParams?.subscription_data as
				| Stripe.Checkout.SessionCreateParams.SubscriptionData
				| undefined,
		}),
	};
};
