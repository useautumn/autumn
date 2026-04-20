import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildFullSubjectViewEpochKey } from "../../builders/buildFullSubjectViewEpochKey.js";
import { FULL_SUBJECT_EPOCH_TTL_SECONDS } from "../../config/fullSubjectCacheConfig.js";

export const incrementFullSubjectViewEpoch = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<number | null> => {
	const { redisV2 } = ctx;
	const epochKey = buildFullSubjectViewEpochKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
	});

	const nextEpoch = await tryRedisWrite(() => redisV2.incr(epochKey), redisV2);
	if (nextEpoch === null || nextEpoch === undefined) return null;
	await tryRedisWrite(
		() => redisV2.expire(epochKey, FULL_SUBJECT_EPOCH_TTL_SECONDS),
		redisV2,
	);
	return nextEpoch;
};
