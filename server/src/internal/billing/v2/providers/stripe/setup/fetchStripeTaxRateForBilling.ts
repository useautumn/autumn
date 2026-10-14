import type Stripe from "stripe";
import { createStripeCli } from "@server/external/connect/createStripeCli";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";

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
