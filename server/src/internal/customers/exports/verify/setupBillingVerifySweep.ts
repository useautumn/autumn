import { AppEnv } from "@autumn/shared";
import type Stripe from "stripe";
import { dbReplicaSlow } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getEarliestCustomerCreatedAt } from "../queries/getBillingVerifyCandidates.js";
import { createBillingVerifyStripeReader } from "./createBillingVerifyStripeReader.js";
import { sweepStripeSubscriptions } from "./sweepStripeSubscriptions.js";

export type BillingVerifySweep = {
	stripeReader: Stripe;
	sweptSubscriptions: Map<string, Stripe.Subscription[]>;
};

export const setupBillingVerifySweep = async ({
	ctx,
	onSubscriptionsScanned,
}: {
	ctx: AutumnContext;
	onSubscriptionsScanned?: (count: number) => Promise<void> | void;
}): Promise<BillingVerifySweep> => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const untilMs = Date.now();
	const sinceMs =
		(await getEarliestCustomerCreatedAt({
			db: dbReplicaSlow ?? ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
		})) ?? untilMs;

	return {
		stripeReader: createBillingVerifyStripeReader({ stripeCli }),
		sweptSubscriptions: await sweepStripeSubscriptions({
			stripeCli,
			includeTestClocks: ctx.env === AppEnv.Sandbox,
			sinceMs,
			untilMs,
			onPage: onSubscriptionsScanned,
			onRetry: ({ attempt, error }) =>
				ctx.logger.warn("billing-verify-export: retrying stripe sweep page", {
					data: {
						attempt,
						error: error instanceof Error ? error.message : String(error),
					},
				}),
		}),
	};
};
