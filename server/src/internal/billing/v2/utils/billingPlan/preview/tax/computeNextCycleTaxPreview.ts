import type { BillingContext, PreviewTax } from "@autumn/shared";
import { atmnToStripeAmount, billingContextToCurrency } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeStripeTaxPreviewForNetSubtotal } from "./computeAttachTaxPreview";
import { computeTaxRateIdPreviewFromTaxableMinorUnits } from "./computeAttachTaxRateIdPreview";

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
		const currency = billingContextToCurrency({
			org: ctx.org,
			billingContext,
		});
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
