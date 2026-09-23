import { AuthType } from "@autumn/shared";
import type Stripe from "stripe";
import { mergeStripeMetadata } from "@/internal/billing/v2/providers/stripe/utils/common/mergeStripeMetadata";
import { buildCheckoutSessionMetadata } from "./buildCheckoutSessionMetadata";

// A payable session can still complete after billing changed through a path that
// skips the checkout lock, so API sessions stay short: 1h (Stripe min 30m, max 24h).
const API_SESSION_LIFETIME_SECONDS = 60 * 60;

// Dashboard links are usually sent to the customer (e.g. by email), so they get
// Stripe's 24h max. Longer-lived links go through long_lived_checkout instead.
const DASHBOARD_SESSION_LIFETIME_SECONDS = 24 * 60 * 60;

export const getDefaultCheckoutSessionLifetimeSeconds = ({
	authType,
}: {
	authType?: AuthType;
}): number =>
	authType === AuthType.Dashboard
		? DASHBOARD_SESSION_LIFETIME_SECONDS
		: API_SESSION_LIFETIME_SECONDS;

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
	paramsSubscriptionData?: Stripe.Checkout.SessionCreateParams.SubscriptionData;
	userSubscriptionData?: Stripe.Checkout.SessionCreateParams.SubscriptionData;
}): Stripe.Checkout.SessionCreateParams.SubscriptionData | undefined => {
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
	defaultSessionLifetimeSeconds = API_SESSION_LIFETIME_SECONDS,
}: {
	params: Stripe.Checkout.SessionCreateParams;
	checkoutSessionParams?: Partial<Stripe.Checkout.SessionCreateParams>;
	currency?: string;
	defaultAllowPromotionCodes?: boolean;
	defaultInvoiceCreation?: Stripe.Checkout.SessionCreateParams.InvoiceCreation;
	defaultSavedPaymentMethodOptions?: Stripe.Checkout.SessionCreateParams.SavedPaymentMethodOptions;
	autumnMetadataId?: string;
	userMetadata?: Record<string, string>;
	/** Used when the caller didn't pass checkout_session_params.expires_at. */
	defaultSessionLifetimeSeconds?: number;
}): Stripe.Checkout.SessionCreateParams => {
	const mergedParams: Stripe.Checkout.SessionCreateParams = {
		...(checkoutSessionParams ?? {}),
		...params,
	};

	const hasPreAppliedDiscounts = Boolean(mergedParams.discounts?.length);

	return {
		...mergedParams,
		expires_at:
			mergedParams.expires_at ??
			Math.floor(Date.now() / 1000) + defaultSessionLifetimeSeconds,
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
							| Stripe.Checkout.SessionCreateParams.SubscriptionData
							| undefined,
						userSubscriptionData: checkoutSessionParams?.subscription_data as
							| Stripe.Checkout.SessionCreateParams.SubscriptionData
							| undefined,
					}),
	};
};
