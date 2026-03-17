import type Stripe from "stripe";
import { buildCheckoutSessionMetadata } from "./buildCheckoutSessionMetadata";

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
	};
};
