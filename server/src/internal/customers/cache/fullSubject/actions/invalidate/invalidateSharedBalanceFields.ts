import { redisV2 } from "@/external/redis/initRedisV2.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tryRedisRead, tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildFullSubjectKey } from "../../builders/buildFullSubjectKey.js";
import { buildSharedFullSubjectBalanceKey } from "../../builders/buildSharedFullSubjectBalanceKey.js";
import { AGGREGATED_BALANCE_FIELD } from "../../config/fullSubjectCacheConfig.js";
import type { CachedFullSubject } from "../../fullSubjectCacheModel.js";

/**
 * Deletes shared balance hash fields for a customer during structural
 * invalidation. Reads the subject view manifest to target specific cusEnt
 * fields + _aggregated per feature hash. Falls back to UNLINK-ing all
 * possible balance hash keys (built from ctx.features) when the subject
 * view is already gone.
 *
 * Must be called BEFORE the subject view key is deleted.
 */
export const invalidateSharedBalanceFields = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<void> => {
	if (!customerId || redisV2.status !== "ready") return;

	const { org, env } = ctx;
	const subjectKey = buildFullSubjectKey({ orgId: org.id, env, customerId });

	const cachedRaw = await tryRedisRead(() => redisV2.get(subjectKey), redisV2);

	if (cachedRaw) {
		await deleteFieldsFromManifest({ ctx, customerId, cachedRaw });
		return;
	}

	await deleteAllBalanceKeys({ ctx, customerId });
};

async function deleteFieldsFromManifest({
	ctx,
	customerId,
	cachedRaw,
}: {
	ctx: AutumnContext;
	customerId: string;
	cachedRaw: string;
}) {
	const { org, env, logger } = ctx;

	let manifest: CachedFullSubject;
	try {
		manifest = JSON.parse(cachedRaw) as CachedFullSubject;
	} catch {
		logger.warn(
			`[invalidateSharedBalanceFields] Failed to parse subject view for ${customerId}, skipping field deletion`,
		);
		return;
	}

	const { customerEntitlementIdsByFeatureId } = manifest;
	if (!customerEntitlementIdsByFeatureId) return;

	const pipeline = redisV2.pipeline();
	let fieldCount = 0;

	for (const [featureId, cusEntIds] of Object.entries(
		customerEntitlementIdsByFeatureId,
	)) {
		const balanceKey = buildSharedFullSubjectBalanceKey({
			orgId: org.id,
			env,
			customerId,
			featureId,
		});
		const fieldsToDelete = [...cusEntIds, AGGREGATED_BALANCE_FIELD];
		pipeline.hdel(balanceKey, ...fieldsToDelete);
		fieldCount += fieldsToDelete.length;
	}

	if (fieldCount > 0) {
		await tryRedisWrite(() => pipeline.exec(), redisV2);
		logger.info(
			`[invalidateSharedBalanceFields] ${customerId}: HDEL ${fieldCount} fields from manifest`,
		);
	}
}

async function deleteAllBalanceKeys({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}) {
	const { org, env, features, logger } = ctx;
	if (features.length === 0) return;

	const pipeline = redisV2.pipeline();

	for (const feature of features) {
		const balanceKey = buildSharedFullSubjectBalanceKey({
			orgId: org.id,
			env,
			customerId,
			featureId: feature.id,
		});
		pipeline.unlink(balanceKey);
	}

	await tryRedisWrite(() => pipeline.exec(), redisV2);
	logger.info(
		`[invalidateSharedBalanceFields] ${customerId}: UNLINK ${features.length} balance keys (fallback)`,
	);
}
