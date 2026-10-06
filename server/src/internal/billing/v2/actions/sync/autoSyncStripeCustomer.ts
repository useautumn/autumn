import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { canAutoSync } from "./canAutoSync";
import { prepareAutoSyncStripeCustomer } from "./setup/prepareAutoSyncStripeCustomer";
import { syncV2 } from "./syncV2";
import { logAutoSyncSkip } from "./utils/logAutoSyncSkip";
import { withStripeSyncCustomerLock } from "./utils/withStripeSyncCustomerLock";

export type AutoSyncCandidates = Awaited<
	ReturnType<typeof prepareAutoSyncStripeCustomer>
>;

/** Imports each eligible prepared subscription or schedule; the writes, after the Stripe reads in prepare. */
export const syncAutoSyncCandidates = async ({
	ctx,
	syncCandidates,
}: {
	ctx: AutumnContext;
	syncCandidates: AutoSyncCandidates;
}) => {
	for (const syncCandidate of syncCandidates) {
		if (!syncCandidate) continue;
		const { match, params } = syncCandidate;
		const eligibility = canAutoSync({ match });
		if (!eligibility.eligible) {
			logAutoSyncSkip({
				logger: ctx.logger,
				source: "customer.create",
				stripeSubscriptionId: match.stripe_subscription_id,
				stripeScheduleId: match.stripe_schedule_id,
				reason: eligibility.reason,
				details: eligibility.details,
			});
			continue;
		}
		await syncV2({
			ctx,
			params,
			tags: ["sync:customer.create"],
		});
	}
};

const autoSyncStripeCustomer = async ({
	ctx,
	customerId,
	stripeCustomerId,
}: {
	ctx: AutumnContext;
	customerId: string;
	stripeCustomerId: string;
}) => {
	const syncCandidates = await prepareAutoSyncStripeCustomer({
		ctx,
		customerId,
		stripeCustomerId,
	});
	await syncAutoSyncCandidates({ ctx, syncCandidates });
};

export const autoSyncStripeCustomerWithLock = (params: {
	ctx: AutumnContext;
	customerId: string;
	stripeCustomerId: string;
}) => {
	const { ctx, customerId } = params;
	return withStripeSyncCustomerLock({
		ctx,
		customerId,
		run: () => autoSyncStripeCustomer(params),
	});
};
