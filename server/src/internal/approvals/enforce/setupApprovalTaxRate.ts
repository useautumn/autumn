import type { BillingContext } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { fetchStripeTaxRateForBilling } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeTaxRateForBilling";

/**
 * Writes skip loading a manual tax rate that only the preview's totals use;
 * approval facts need it, so a taxed total is checked as the preview showed it.
 */
export const setupApprovalTaxRate = async ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
}): Promise<BillingContext> => {
	if (!billingContext.taxRateId || billingContext.stripeTaxRate) {
		return billingContext;
	}
	return {
		...billingContext,
		stripeTaxRate: await fetchStripeTaxRateForBilling({
			ctx,
			taxRateId: billingContext.taxRateId,
		}),
	};
};
