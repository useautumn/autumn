import {
	atmnToStripeAmount,
	type PreviewTax,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type Stripe from "stripe";
import { taxableMinorUnitsToTaxMinorUnits } from "@/internal/billing/v2/utils/billingPlan/preview/tax/computeAttachTaxRateIdPreview";

/** Tax for a manual Stripe tax rate applied to every line; no automatic tax. */
export const computeInvoiceTaxPreview = ({
	taxableAmounts,
	currency,
	taxRate,
}: {
	taxableAmounts: number[];
	currency: string;
	taxRate?: Stripe.TaxRate;
}): PreviewTax | undefined => {
	if (!taxRate) return undefined;

	const taxMinorUnits = taxableAmounts.reduce(
		(sum, amount) =>
			sum +
			taxableMinorUnitsToTaxMinorUnits({
				taxableMinorUnits: atmnToStripeAmount({ amount, currency }),
				percentage: taxRate.percentage,
				inclusive: taxRate.inclusive,
			}),
		0,
	);
	const taxAmount = stripeToAtmnAmount({ amount: taxMinorUnits, currency });

	return {
		total: taxRate.inclusive ? 0 : taxAmount,
		amount_inclusive: taxRate.inclusive ? taxAmount : 0,
		amount_exclusive: taxRate.inclusive ? 0 : taxAmount,
		currency,
		status: "complete",
	};
};
