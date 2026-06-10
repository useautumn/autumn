import type { BillingContext, PreviewTax } from "@autumn/shared";
import { atmnToStripeAmount, orgToCurrency } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeStripeTaxPreviewForNetSubtotal } from "./computeAttachTaxPreview";
import { computeTaxRateIdPreviewFromTaxableMinorUnits } from "./computeAttachTaxRateIdPreview";

/**
 * Tax preview for the next cycle, computed on its net post-discount total.
 * Same precedence as the immediate preview: tax_rate_id overrides Stripe Tax.
 */
export const computeNextCycleTaxPreview = async ({
	ctx,
	billingContext,
	netSubtotal,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	netSubtotal: number;
}): Promise<PreviewTax | undefined> => {
	if (billingContext.taxRateId) {
		const currency = orgToCurrency({ org: ctx.org });
		return computeTaxRateIdPreviewFromTaxableMinorUnits({
			ctx,
			billingContext,
			taxableMinorUnits: [
				atmnToStripeAmount({ amount: netSubtotal, currency }),
			],
		});
	}

	return computeStripeTaxPreviewForNetSubtotal({
		ctx,
		billingContext,
		netSubtotal,
	});
};
