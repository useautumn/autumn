import { miscRedis } from "@/external/redis/initRedis.js";

export const releaseRedisIdempotencyKey = async ({
	storageKey,
}: {
	storageKey: string;
}): Promise<void> => {
	if (miscRedis.status !== "ready") return;

	try {
		await miscRedis.del(storageKey);
	} catch {
		return;
	}
};
