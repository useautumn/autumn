import { AppEnv } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { SWEEP_MIN_CUSTOMER_COUNT } from "./billingVerifyExportConfig.js";
import { createBillingVerifyStripeReader } from "./createBillingVerifyStripeReader.js";
import { sweepStripeSubscriptions } from "./sweepStripeSubscriptions.js";

export type BillingVerifySweep = {
	stripeReader: Stripe;
	/** Null when the run was too small to sweep — customers are read live. */
	sweptSubscriptions: Map<string, Stripe.Subscription[]> | null;
};

export const setupBillingVerifySweep = async ({
	ctx,
	totalCount,
}: {
	ctx: AutumnContext;
	totalCount: number;
}): Promise<BillingVerifySweep> => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const stripeReader = createBillingVerifyStripeReader({ stripeCli });

	if (totalCount < SWEEP_MIN_CUSTOMER_COUNT) {
		return { stripeReader, sweptSubscriptions: null };
	}

	return {
		stripeReader,
		sweptSubscriptions: await sweepStripeSubscriptions({
			stripeCli,
			includeTestClocks: ctx.env === AppEnv.Sandbox,
		}),
	};
};
