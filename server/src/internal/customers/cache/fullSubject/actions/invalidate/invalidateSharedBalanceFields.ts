import type { Redis } from "ioredis";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tryRedisRead, tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildFullSubjectKey } from "../../builders/buildFullSubjectKey.js";
import { buildSharedFullSubjectBalanceKey } from "../../builders/buildSharedFullSubjectBalanceKey.js";
import {
	AGGREGATED_BALANCE_FIELD,
	USAGE_WINDOWS_FIELD,
} from "../../config/fullSubjectCacheConfig.js";
import type { CachedFullSubject } from "../../fullSubjectCacheModel.js";

/**
 * Deletes shared balance hash fields for a customer during structural
 * invalidation. Reads the subject view manifest to target specific cusEnt
 * fields + _aggregated per feature hash. No-op when the subject view is
 * already gone — paired with HSET-on-write semantics in setCachedFullSubject,
 * stale fields are overwritten on the next populate.
 *
 * Must be called BEFORE the subject view key is deleted.
 */
export const invalidateSharedBalanceFields = async ({
	ctx,
	customerId,
	redisV2 = ctx.redisV2,
}: {
	ctx: AutumnContext;
	customerId: string;
	redisV2?: Redis;
}): Promise<void> => {
	const { org, env } = ctx;
	if (!customerId || redisV2.status !== "ready") return;

	const subjectKey = buildFullSubjectKey({ orgId: org.id, env, customerId });

	const cachedRaw = await tryRedisRead(() => redisV2.get(subjectKey), redisV2);
	if (!cachedRaw) return;

	await deleteFieldsFromManifest({ ctx, customerId, cachedRaw, redisV2 });
};

async function deleteFieldsFromManifest({
	ctx,
	customerId,
	cachedRaw,
	redisV2,
}: {
	ctx: AutumnContext;
	customerId: string;
	cachedRaw: string;
	redisV2: Redis;
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

	// Capped features may have no entitlements, so their hashes only appear in
	// usageWindowFeatureIds; union both so `_usage_windows` is cleared too.
	// Safe to delete counters: capped tracks write through to PG synchronously,
	// and the rebuild re-seeds the field from PG.
	// Raw blob, no sanitize walker: cjson re-encodes empty arrays as {}, so
	// array fields must be Array.isArray-guarded before spreading.
	const usageWindowFeatureIds = Array.isArray(manifest.usageWindowFeatureIds)
		? manifest.usageWindowFeatureIds
		: [];
	const featureIds = new Set([
		...Object.keys(customerEntitlementIdsByFeatureId),
		...usageWindowFeatureIds,
	]);

	const pipeline = redisV2.pipeline();
	let fieldCount = 0;

	for (const featureId of featureIds) {
		const rawCusEntIds = customerEntitlementIdsByFeatureId[featureId];
		const cusEntIds = Array.isArray(rawCusEntIds) ? rawCusEntIds : [];
		const balanceKey = buildSharedFullSubjectBalanceKey({
			orgId: org.id,
			env,
			customerId,
			featureId,
		});
		const fieldsToDelete = [
			...cusEntIds,
			AGGREGATED_BALANCE_FIELD,
			USAGE_WINDOWS_FIELD,
		];
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
