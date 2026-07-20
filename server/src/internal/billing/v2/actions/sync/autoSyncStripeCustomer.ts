import { ms } from "@autumn/shared";
import { redis } from "@/external/redis/initRedis";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { canAutoSync } from "./canAutoSync";
import { prepareAutoSyncStripeCustomer } from "./setup/prepareAutoSyncStripeCustomer";
import { syncV2 } from "./syncV2";
import { withStripeSyncCustomerLock } from "./utils/withStripeSyncCustomerLock";

const SYNC_COMPLETE_TTL_MS = ms.days(1);

const getSyncCompleteKey = ({
	ctx,
	customerId,
	stripeCustomerId,
}: {
	ctx: AutumnContext;
	customerId: string;
	stripeCustomerId: string;
}) =>
	`stripe-sync:complete:${ctx.org.id}:${ctx.env}:${customerId}:${stripeCustomerId}`;

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
	for (const syncCandidate of syncCandidates) {
		if (!syncCandidate) continue;
		const { match, params } = syncCandidate;
		if (!canAutoSync({ match }).eligible) continue;
		await syncV2({
			ctx,
			params,
			tags: ["sync:customer.create"],
		});
	}
};

export const autoSyncStripeCustomerWithLock = (params: {
	ctx: AutumnContext;
	customerId: string;
	stripeCustomerId: string;
}) => {
	const { ctx, customerId, stripeCustomerId } = params;
	const completeKey = getSyncCompleteKey({ ctx, customerId, stripeCustomerId });
	return withStripeSyncCustomerLock({
		ctx,
		customerId,
		run: async () => {
			const complete = await tryRedisOp({
				source: "stripe-sync-customer:complete:get",
				operation: () => redis.get(completeKey),
			});
			if (complete === "1") return false;

			await autoSyncStripeCustomer(params);
			await tryRedisOp({
				source: "stripe-sync-customer:complete:set",
				operation: () =>
					redis.set(completeKey, "1", "PX", SYNC_COMPLETE_TTL_MS),
			});
			return true;
		},
	});
};
