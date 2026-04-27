import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildFullSubjectViewEpochKey } from "../../builders/buildFullSubjectViewEpochKey.js";
import { FULL_SUBJECT_EPOCH_TTL_SECONDS } from "../../config/fullSubjectCacheConfig.js";

export const getOrInitFullSubjectViewEpoch = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<number> => {
	const { redisV2 } = ctx;
	const epochKey = buildFullSubjectViewEpochKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
	});

	// GETEX reads the epoch and refreshes its TTL in one round trip.
	const currentEpoch = await runRedisOp({
		operation: () =>
			redisV2.getex(epochKey, "EX", FULL_SUBJECT_EPOCH_TTL_SECONDS),
		source: "getOrInitFullSubjectViewEpoch:getex",
		redisInstance: redisV2,
	});
	if (currentEpoch !== null && currentEpoch !== undefined) {
		const parsedEpoch = Number.parseInt(currentEpoch, 10);
		return Number.isNaN(parsedEpoch) ? 0 : parsedEpoch;
	}

	await runRedisOp({
		operation: () =>
			redisV2.set(epochKey, "0", "EX", FULL_SUBJECT_EPOCH_TTL_SECONDS),
		source: "getOrInitFullSubjectViewEpoch:init",
		redisInstance: redisV2,
	});
	return 0;
};
