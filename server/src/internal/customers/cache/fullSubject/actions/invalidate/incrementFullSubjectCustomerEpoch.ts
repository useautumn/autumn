import { redisV2 } from "@/external/redis/initRedisV2.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildFullSubjectCustomerEpochKey } from "../../builders/buildFullSubjectCustomerEpochKey.js";

export const incrementFullSubjectCustomerEpoch = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<number | null> => {
	const epochKey = buildFullSubjectCustomerEpochKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
	});

	const nextEpoch = await tryRedisWrite(() => redisV2.incr(epochKey), redisV2);
	if (nextEpoch === null || nextEpoch === undefined) return null;
	return nextEpoch;
};
