import { redisV2 } from "@/external/redis/initRedisV2.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tryRedisRead, tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildFullSubjectViewEpochKey } from "../../builders/buildFullSubjectViewEpochKey.js";

export const getOrInitFullSubjectViewEpoch = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<number> => {
	const epochKey = buildFullSubjectViewEpochKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
	});

	const currentEpoch = await tryRedisRead(() => redisV2.get(epochKey), redisV2);
	if (currentEpoch !== null && currentEpoch !== undefined) {
		const parsedEpoch = Number.parseInt(currentEpoch, 10);
		return Number.isNaN(parsedEpoch) ? 0 : parsedEpoch;
	}

	await tryRedisWrite(() => redisV2.setnx(epochKey, "0"), redisV2);
	const initializedEpoch = await tryRedisRead(
		() => redisV2.get(epochKey),
		redisV2,
	);
	if (!initializedEpoch) return 0;

	const parsedEpoch = Number.parseInt(initializedEpoch, 10);
	return Number.isNaN(parsedEpoch) ? 0 : parsedEpoch;
};
