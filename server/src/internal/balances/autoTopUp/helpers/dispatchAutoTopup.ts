import {
	type AutoTopupDispatchResult,
	dispatchAutoTopup as dispatch,
} from "@autumn/auto-topup";
import { getMiscCache } from "@/external/redis/miscCache/getMiscCache.js";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getSqsJobs } from "@/queue/getSqsJobs.js";

/** The server's binding of the shared dispatch: the request's org, env, and logger over the misc cache and the job queue. */
export const dispatchAutoTopup = async ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: AutumnContext;
	customerId: string;
	featureId: string;
}): Promise<AutoTopupDispatchResult> => {
	try {
		return await dispatch({
			ctx: {
				miscCache: getMiscCache(),
				logger: ctx.logger,
				sqsJobs: getSqsJobs(),
			},
			payload: { orgId: ctx.org.id, env: ctx.env, customerId, featureId },
		});
	} catch (error) {
		if (!(error instanceof RedisUnavailableError)) throw error;
		return { enqueued: false, reason: "redis_unavailable" };
	}
};
