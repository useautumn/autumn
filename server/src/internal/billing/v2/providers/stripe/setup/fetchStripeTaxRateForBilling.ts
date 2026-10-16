import type Stripe from "stripe";
import { createStripeCli } from "@server/external/connect/createStripeCli";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";

/**
 * Fetches a Stripe TaxRate by id. Returns undefined when no id is provided
 * so this can be wired unconditionally into setup. Errors on missing/deleted
 * rates surface naturally to the caller — the real attach also lets Stripe
 * reject an invalid `default_tax_rates`.
 */
export const fetchStripeTaxRateForBilling = async ({
	ctx,
	taxRateId,
}: {
	ctx: AutumnContext;
	taxRateId?: string;
}): Promise<Stripe.TaxRate | undefined> => {
	if (!taxRateId) return undefined;
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	return await stripeCli.taxRates.retrieve(taxRateId);
};
