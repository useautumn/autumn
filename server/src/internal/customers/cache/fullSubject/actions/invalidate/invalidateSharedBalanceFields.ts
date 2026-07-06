import type { SubjectBalance } from "@autumn/shared";
import type { Redis } from "ioredis";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { flushSubjectBalancesToDb } from "@/internal/balances/utils/sync/flushSubjectBalancesToDb.js";
import { tryRedisRead, tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildFullSubjectKey } from "../../builders/buildFullSubjectKey.js";
import { buildSharedFullSubjectBalanceKey } from "../../builders/buildSharedFullSubjectBalanceKey.js";
import {
	AGGREGATED_BALANCE_FIELD,
	USAGE_WINDOWS_FIELD,
} from "../../config/fullSubjectCacheConfig.js";
import type { CachedFullSubject } from "../../fullSubjectCacheModel.js";
import { roundSubjectBalance } from "../../roundCacheBalance.js";
import { sanitizeCachedSubjectBalance } from "../../sanitize/index.js";

// Kill switch: set to false to revert to the legacy blind-HDEL path (drops
// unsynced deductions racing the invalidation).
const FLUSH_BALANCES_ON_INVALIDATION = true;

/**
 * Destructively reads (atomic read + HDEL) the shared balance hash fields for
 * a customer during structural invalidation, then flushes the values to
 * Postgres — an invalidation racing an un-synced deduction must not lose it.
 * No-op when the subject view is already gone — paired with HSET-on-write
 * semantics in setCachedFullSubject, stale fields are overwritten on the next
 * populate.
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

	if (!FLUSH_BALANCES_ON_INVALIDATION) {
		await deleteFieldsFromManifest({ ctx, customerId, cachedRaw, redisV2 });
		return;
	}

	await getDelFieldsFromManifest({ ctx, customerId, cachedRaw, redisV2 });
};

type BalanceFieldTargets = {
	balanceKeys: string[];
	customerEntitlementIdsByKey: string[][];
};

const manifestToBalanceFieldTargets = ({
	ctx,
	customerId,
	cachedRaw,
}: {
	ctx: AutumnContext;
	customerId: string;
	cachedRaw: string;
}): BalanceFieldTargets | null => {
	const { org, env, logger } = ctx;

	let manifest: CachedFullSubject;
	try {
		manifest = JSON.parse(cachedRaw) as CachedFullSubject;
	} catch {
		logger.warn(
			`[invalidateSharedBalanceFields] Failed to parse subject view for ${customerId}, skipping field deletion`,
		);
		return null;
	}

	const { customerEntitlementIdsByFeatureId } = manifest;
	if (!customerEntitlementIdsByFeatureId) return null;

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
	if (featureIds.size === 0) return null;

	const balanceKeys: string[] = [];
	const customerEntitlementIdsByKey: string[][] = [];
	for (const featureId of featureIds) {
		const rawCusEntIds = customerEntitlementIdsByFeatureId[featureId];
		balanceKeys.push(
			buildSharedFullSubjectBalanceKey({
				orgId: org.id,
				env,
				customerId,
				featureId,
			}),
		);
		customerEntitlementIdsByKey.push(
			Array.isArray(rawCusEntIds) ? rawCusEntIds : [],
		);
	}

	return { balanceKeys, customerEntitlementIdsByKey };
};

async function getDelFieldsFromManifest({
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
	const { logger } = ctx;

	const targets = manifestToBalanceFieldTargets({ ctx, customerId, cachedRaw });
	if (!targets) return;
	const { balanceKeys, customerEntitlementIdsByKey } = targets;

	const resultRaw = await tryRedisWrite(
		() =>
			redisV2.getDelFullSubjectBalanceFields(
				balanceKeys.length,
				...balanceKeys,
				JSON.stringify(customerEntitlementIdsByKey),
				JSON.stringify([AGGREGATED_BALANCE_FIELD, USAGE_WINDOWS_FIELD]),
			),
		redisV2,
	);

	if (resultRaw === null) {
		logger.warn(
			`[invalidateSharedBalanceFields] ${customerId}: GETDEL failed, skipping flush`,
		);
		return;
	}

	const subjectBalances = parseSubjectBalances({
		ctx,
		customerId,
		resultRaw,
	});

	logger.info(
		`[invalidateSharedBalanceFields] ${customerId}: GETDEL ${balanceKeys.length} balance keys, flushing ${subjectBalances.length} balances`,
	);

	await flushSubjectBalancesToDb({
		ctx,
		customerId,
		subjectBalances,
		source: "invalidateSharedBalanceFields",
	});
}

/** Legacy blind HDEL, kept as the DISABLE_INVALIDATION_BALANCE_FLUSH path. */
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
	const { logger } = ctx;

	const targets = manifestToBalanceFieldTargets({ ctx, customerId, cachedRaw });
	if (!targets) return;
	const { balanceKeys, customerEntitlementIdsByKey } = targets;

	const pipeline = redisV2.pipeline();
	let fieldCount = 0;

	for (let index = 0; index < balanceKeys.length; index++) {
		const fieldsToDelete = [
			...customerEntitlementIdsByKey[index],
			AGGREGATED_BALANCE_FIELD,
			USAGE_WINDOWS_FIELD,
		];
		pipeline.hdel(balanceKeys[index], ...fieldsToDelete);
		fieldCount += fieldsToDelete.length;
	}

	if (fieldCount > 0) {
		await tryRedisWrite(() => pipeline.exec(), redisV2);
		logger.info(
			`[invalidateSharedBalanceFields] ${customerId}: HDEL ${fieldCount} fields from manifest`,
		);
	}
}

function parseSubjectBalances({
	ctx,
	customerId,
	resultRaw,
}: {
	ctx: AutumnContext;
	customerId: string;
	resultRaw: string;
}): SubjectBalance[] {
	let valuesByKey: unknown[];
	try {
		valuesByKey = JSON.parse(resultRaw) as unknown[];
	} catch (error) {
		ctx.logger.warn(
			`[invalidateSharedBalanceFields] ${customerId}: failed to parse GETDEL result, skipping flush, error: ${error}`,
		);
		return [];
	}

	// cjson encodes empty Lua tables as {}, so each per-key entry must be
	// Array.isArray-guarded.
	const allValues = (Array.isArray(valuesByKey) ? valuesByKey : []).flatMap(
		(values) => (Array.isArray(values) ? values : []),
	);

	const subjectBalances: SubjectBalance[] = [];
	for (const value of allValues) {
		if (typeof value !== "string") continue;
		try {
			// Same parse path as getCachedFeatureBalances: cjson-written values
			// need sanitizing (e.g. empty arrays re-encoded as {}).
			const parsedBalance = JSON.parse(value) as SubjectBalance;
			subjectBalances.push(
				roundSubjectBalance({
					subjectBalance: sanitizeCachedSubjectBalance({
						subjectBalance: parsedBalance,
					}),
				}),
			);
		} catch {
			ctx.logger.warn(
				`[invalidateSharedBalanceFields] ${customerId}: unparseable balance field, dropping it from flush`,
			);
		}
	}
	return subjectBalances;
}
