import { AppEnv } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { createBillingVerifyStripeReader } from "./createBillingVerifyStripeReader.js";
import { sweepStripeSubscriptions } from "./sweepStripeSubscriptions.js";

export type BillingVerifySweep = {
	stripeReader: Stripe;
	sweptSubscriptions: Map<string, Stripe.Subscription[]>;
};

export const setupBillingVerifySweep = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<BillingVerifySweep> => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	return {
		stripeReader: createBillingVerifyStripeReader({ stripeCli }),
		sweptSubscriptions: await sweepStripeSubscriptions({
			stripeCli,
			includeTestClocks: ctx.env === AppEnv.Sandbox,
		}),
	};
};
