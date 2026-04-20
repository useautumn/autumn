import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildFullSubjectKey } from "../../builders/buildFullSubjectKey.js";

export const invalidateCachedFullSubjectExact = async ({
	customerId,
	entityId,
	ctx,
	source,
}: {
	customerId: string;
	entityId?: string;
	ctx: AutumnContext;
	source?: string;
}): Promise<void> => {
	const { org, env, logger, redisV2 } = ctx;
	if (!customerId || redisV2.status !== "ready") return;

	const subjectKey = buildFullSubjectKey({
		orgId: org.id,
		env,
		customerId,
		entityId,
	});
	const subjectLabel = entityId ? `${customerId}:${entityId}` : customerId;

	try {
		await tryRedisWrite(async () => {
			await redisV2.unlink(subjectKey);
		}, redisV2);

		logger.info(
			`[invalidateCachedFullSubject] subject: ${subjectLabel}, source: ${source}`,
		);
	} catch (error) {
		logger.error(
			`[invalidateCachedFullSubject] subject: ${subjectLabel}, source: ${source}, error: ${error}`,
		);
	}
};
