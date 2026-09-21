import { AppEnv } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { createBillingVerifyStripeReader } from "./createBillingVerifyStripeReader.js";
import { sweepStripeSchedules } from "./sweepStripeSchedules.js";
import { sweepStripeSubscriptions } from "./sweepStripeSubscriptions.js";

// Below this many customers, reading each one live costs fewer Stripe calls
// than listing the whole org.
const SWEEP_MIN_CUSTOMER_COUNT = 500;

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

	if (totalCount < SWEEP_MIN_CUSTOMER_COUNT) {
		return {
			stripeReader: createBillingVerifyStripeReader({ stripeCli }),
			sweptSubscriptions: null,
		};
	}

	const [sweptSubscriptions, schedulesById] = await Promise.all([
		sweepStripeSubscriptions({
			stripeCli,
			includeTestClocks: ctx.env === AppEnv.Sandbox,
		}),
		sweepStripeSchedules({ stripeCli }),
	]);

	return {
		stripeReader: createBillingVerifyStripeReader({ stripeCli, schedulesById }),
		sweptSubscriptions,
	};
};
