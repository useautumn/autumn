import {
	CollectionMethod,
	type FullCusProduct,
	type InvoiceModeParams,
	type PaymentBehaviorIntent,
} from "@autumn/shared";

type TrialConversionParams = {
	invoiceMode?: InvoiceModeParams;
	paymentBehaviorIntent?: PaymentBehaviorIntent;
};

/** The trial was attached in invoice mode, so it converts by invoice instead of charging a card. */
export const isInvoicedTrial = (customerProduct: FullCusProduct): boolean =>
	customerProduct.collection_method === CollectionMethod.SendInvoice;

/** How a lapsed Autumn-managed trial is billed into Stripe. */
export const trialConversionParams = ({
	customerProduct,
}: {
	customerProduct: FullCusProduct;
}): TrialConversionParams => {
	if (isInvoicedTrial(customerProduct)) {
		return {
			invoiceMode: {
				enabled: true,
				finalize: true,
				enable_plan_immediately: true,
			},
		};
	}

	return { paymentBehaviorIntent: "error_if_incomplete" };
};
