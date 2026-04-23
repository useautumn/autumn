import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildFullSubjectKey } from "../../builders/buildFullSubjectKey.js";
import { buildFullSubjectViewEpochKey } from "../../builders/buildFullSubjectViewEpochKey.js";
import { FULL_SUBJECT_EPOCH_TTL_SECONDS } from "../../config/fullSubjectCacheConfig.js";
import { invalidateSharedBalanceFields } from "./invalidateSharedBalanceFields.js";

export const invalidateCachedFullSubject = async ({
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
	if (!customerId) return;

	await invalidateSharedBalanceFields({
		ctx,
		customerId,
	});

	const { org, env, logger, redisV2 } = ctx;

	// All four ops share the `{customerId}` hash tag so they land on the same
	// Redis slot. Bundling them into a single pipeline collapses what used to
	// be 3–4 sequential RTTs (UNLINK subject + optional UNLINK entity subject
	// + INCR epoch + EXPIRE epoch) into one.
	const customerSubjectKey = buildFullSubjectKey({
		orgId: org.id,
		env,
		customerId,
	});

	const entitySubjectKey = entityId
		? buildFullSubjectKey({ orgId: org.id, env, customerId, entityId })
		: undefined;

	const epochKey = buildFullSubjectViewEpochKey({
		orgId: org.id,
		env,
		customerId,
	});

	const pipeline = redisV2.pipeline().unlink(customerSubjectKey);
	if (entitySubjectKey) pipeline.unlink(entitySubjectKey);
	pipeline.incr(epochKey).expire(epochKey, FULL_SUBJECT_EPOCH_TTL_SECONDS);

	const subjectLabel = entityId ? `${customerId}:${entityId}` : customerId;
	const result = await tryRedisOp({
		operation: () => pipeline.exec(),
		source: "invalidateCachedFullSubject",
		redisInstance: redisV2,
		onError: (error: unknown) => {
			logger.error(
				`[invalidateCachedFullSubject] subject: ${subjectLabel}, source: ${source}, error: ${error}`,
			);
		},
	});

	if (result !== undefined) {
		logger.info(
			`[invalidateCachedFullSubject] subject: ${subjectLabel}, source: ${source}`,
		);
	}
};
