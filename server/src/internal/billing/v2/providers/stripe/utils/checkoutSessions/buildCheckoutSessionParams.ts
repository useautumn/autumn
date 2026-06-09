import type Stripe from "stripe";
import { mergeStripeMetadata } from "@/internal/billing/v2/providers/stripe/utils/common/mergeStripeMetadata";
import { buildCheckoutSessionMetadata } from "./buildCheckoutSessionMetadata";
import type { Checkout as CheckoutSessions } from "stripe/resources/Checkout/Sessions.js";

/**
 * Deep-merges subscription_data so user-provided fields (e.g. metadata)
 * are preserved alongside Autumn-internal fields (e.g. trial_end).
 */
const mergeSubscriptionData = ({
	userMetadata,
	paramsSubscriptionData,
	userSubscriptionData,
}: {
	userMetadata?: Record<string, string>;
	paramsSubscriptionData?: CheckoutSessions.SessionCreateParams.SubscriptionData;
	userSubscriptionData?: CheckoutSessions.SessionCreateParams.SubscriptionData;
}): CheckoutSessions.SessionCreateParams.SubscriptionData | undefined => {
	if (!paramsSubscriptionData && !userSubscriptionData && !userMetadata) {
		return undefined;
	}

	const autumnMetadata = {
		...(userSubscriptionData?.metadata ?? {}),
		...(paramsSubscriptionData?.metadata ?? {}),
	};

	return {
		...(userSubscriptionData ?? {}),
		...(paramsSubscriptionData ?? {}),
		metadata: mergeStripeMetadata({ userMetadata, autumnMetadata }) ?? {},
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
	userMetadata,
}: {
	params: CheckoutSessions.SessionCreateParams;
	checkoutSessionParams?: Partial<CheckoutSessions.SessionCreateParams>;
	currency?: string;
	defaultAllowPromotionCodes?: boolean;
	defaultInvoiceCreation?: CheckoutSessions.SessionCreateParams.InvoiceCreation;
	defaultSavedPaymentMethodOptions?: CheckoutSessions.SessionCreateParams.SavedPaymentMethodOptions;
	autumnMetadataId?: string;
	userMetadata?: Record<string, string>;
}): CheckoutSessions.SessionCreateParams => {
	const mergedParams: CheckoutSessions.SessionCreateParams = {
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
			userMetadata,
			paramsMetadata: params.metadata,
			checkoutSessionMetadata: checkoutSessionParams?.metadata,
			autumnMetadataId,
		}),
		subscription_data:
			mergedParams.mode === "payment"
				? undefined
				: mergeSubscriptionData({
						userMetadata,
						paramsSubscriptionData: params.subscription_data as
							| CheckoutSessions.SessionCreateParams.SubscriptionData
							| undefined,
						userSubscriptionData:
							checkoutSessionParams?.subscription_data as
								| CheckoutSessions.SessionCreateParams.SubscriptionData
								| undefined,
					}),
	};
};
