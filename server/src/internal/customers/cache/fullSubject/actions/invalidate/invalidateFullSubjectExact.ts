import { redisV2 } from "@/external/redis/initRedisV2.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildFullSubjectGuardKey } from "../../builders/buildFullSubjectGuardKey.js";
import { buildFullSubjectKey } from "../../builders/buildFullSubjectKey.js";
import { buildFullSubjectReserveKey } from "../../builders/buildFullSubjectReserveKey.js";
import { FULL_SUBJECT_CACHE_GUARD_TTL_SECONDS } from "../../config/fullSubjectCacheConfig.js";

export const invalidateCachedFullSubjectExact = async ({
	customerId,
	entityId,
	ctx,
	source,
	skipGuard = false,
}: {
	customerId: string;
	entityId?: string;
	ctx: AutumnContext;
	source?: string;
	skipGuard?: boolean;
}): Promise<void> => {
	const { org, env, logger } = ctx;
	if (!customerId || redisV2.status !== "ready") return;

	const subjectKey = buildFullSubjectKey({
		orgId: org.id,
		env,
		customerId,
		entityId,
	});
	const guardKey = buildFullSubjectGuardKey({
		orgId: org.id,
		env,
		customerId,
		entityId,
	});
	const reserveKey = buildFullSubjectReserveKey({
		orgId: org.id,
		env,
		customerId,
		entityId,
	});
	const subjectLabel = entityId ? `${customerId}:${entityId}` : customerId;
	const guardTimestamp = Date.now().toString();

	try {
		await tryRedisWrite(async () => {
			const multi = redisV2.multi();
			if (!skipGuard) {
				multi.set(
					guardKey,
					guardTimestamp,
					"EX",
					FULL_SUBJECT_CACHE_GUARD_TTL_SECONDS,
				);
			}
			multi.unlink(subjectKey);
			multi.unlink(reserveKey);
			await multi.exec();
		}, redisV2);

		logger.info(
			`[invalidateCachedFullSubject] subject: ${subjectLabel}, source: ${source}, skipGuard: ${skipGuard}`,
		);
	} catch (error) {
		logger.error(
			`[invalidateCachedFullSubject] subject: ${subjectLabel}, source: ${source}, error: ${error}`,
		);
	}
};
