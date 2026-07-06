import type { SubjectBalance, UsageWindow } from "@autumn/shared";
import type { Redis } from "ioredis";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { flushSubjectBalancesToDb } from "@/internal/balances/utils/sync/flushSubjectBalancesToDb.js";
import type { UsageWindowUpdate } from "@/internal/balances/utils/types/usageWindowUpdate.js";
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

// Kill switch: set to false to force the legacy blind-HDEL path everywhere,
// ignoring callers' flushBalances opt-in.
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
	flushBalances = false,
}: {
	ctx: AutumnContext;
	customerId: string;
	redisV2?: Redis;
	/** Flush cached balances to Postgres before deleting them. Opt-in: only
	 *  safe when the caller has NOT just written balances to Postgres directly
	 *  (the cached balances must still be the source of truth). */
	flushBalances?: boolean;
}): Promise<void> => {
	const { org, env } = ctx;
	if (!customerId || redisV2.status !== "ready") return;

	const subjectKey = buildFullSubjectKey({ orgId: org.id, env, customerId });

	const cachedRaw = await tryRedisRead(() => redisV2.get(subjectKey), redisV2);
	if (!cachedRaw) return;

	if (!FLUSH_BALANCES_ON_INVALIDATION || !flushBalances) {
		await deleteFieldsFromManifest({ ctx, customerId, cachedRaw, redisV2 });
		return;
	}

	await getDelFieldsFromManifest({ ctx, customerId, cachedRaw, redisV2 });
};

type BalanceFieldTargets = {
	internalCustomerId: string;
	featureIds: string[];
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
	// usageWindowFeatureIds; union both so `_usage_windows` is covered too.
	// Raw blob, no sanitize walker: cjson re-encodes empty arrays as {}, so
	// array fields must be Array.isArray-guarded before spreading.
	const usageWindowFeatureIds = Array.isArray(manifest.usageWindowFeatureIds)
		? manifest.usageWindowFeatureIds
		: [];
	const featureIdSet = new Set([
		...Object.keys(customerEntitlementIdsByFeatureId),
		...usageWindowFeatureIds,
	]);
	if (featureIdSet.size === 0) return null;

	const featureIds: string[] = [];
	const balanceKeys: string[] = [];
	const customerEntitlementIdsByKey: string[][] = [];
	for (const featureId of featureIdSet) {
		const rawCusEntIds = customerEntitlementIdsByFeatureId[featureId];
		featureIds.push(featureId);
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

	return {
		internalCustomerId: manifest.internalCustomerId,
		featureIds,
		balanceKeys,
		customerEntitlementIdsByKey,
	};
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

	// `_usage_windows` is read+deleted alongside the cusEnt fields (last field
	// per key) so window counters are flushed too, not just deleted.
	const fieldsByKey = customerEntitlementIdsByKey.map((cusEntIds) => [
		...cusEntIds,
		USAGE_WINDOWS_FIELD,
	]);

	const resultRaw = await tryRedisWrite(
		() =>
			redisV2.getDelFullSubjectBalanceFields(
				balanceKeys.length,
				...balanceKeys,
				JSON.stringify(fieldsByKey),
				JSON.stringify([AGGREGATED_BALANCE_FIELD]),
			),
		redisV2,
	);

	if (resultRaw === null) {
		logger.warn(
			`[invalidateSharedBalanceFields] ${customerId}: GETDEL failed, skipping flush`,
		);
		return;
	}

	const parsed = parseGetDelResult({
		ctx,
		customerId,
		resultRaw,
		targets,
		fieldsByKey,
	});
	if (!parsed) return;
	const { subjectBalances, usageWindowUpdates } = parsed;

	logger.info(
		`[invalidateSharedBalanceFields] ${customerId}: GETDEL ${balanceKeys.length} balance keys, flushing ${subjectBalances.length} balances, ${usageWindowUpdates.length} usage windows`,
	);

	await flushSubjectBalancesToDb({
		ctx,
		customerId,
		subjectBalances,
		usageWindowUpdates,
		source: "invalidateSharedBalanceFields",
	});
}

/** Legacy blind HDEL, kept as the FLUSH_BALANCES_ON_INVALIDATION=false path. */
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

function parseGetDelResult({
	ctx,
	customerId,
	resultRaw,
	targets,
	fieldsByKey,
}: {
	ctx: AutumnContext;
	customerId: string;
	resultRaw: string;
	targets: BalanceFieldTargets;
	fieldsByKey: string[][];
}): {
	subjectBalances: SubjectBalance[];
	usageWindowUpdates: UsageWindowUpdate[];
} | null {
	const { logger } = ctx;

	let valuesByKey: unknown[];
	try {
		valuesByKey = JSON.parse(resultRaw) as unknown[];
	} catch (error) {
		logger.warn(
			`[invalidateSharedBalanceFields] ${customerId}: failed to parse GETDEL result, skipping flush, error: ${error}`,
		);
		return null;
	}
	if (!Array.isArray(valuesByKey)) return null;

	const subjectBalances: SubjectBalance[] = [];
	const usageWindowUpdates: UsageWindowUpdate[] = [];

	for (let keyIndex = 0; keyIndex < fieldsByKey.length; keyIndex++) {
		const rawValues = valuesByKey[keyIndex];
		// cjson encodes empty Lua tables as {}, so each per-key entry must be
		// Array.isArray-guarded.
		const values = Array.isArray(rawValues) ? (rawValues as unknown[]) : [];
		const fields = fieldsByKey[keyIndex];

		for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex++) {
			const value = values[fieldIndex];
			if (typeof value !== "string") continue;

			const isUsageWindowsField = fieldIndex === fields.length - 1;
			try {
				if (isUsageWindowsField) {
					// Empty/non-array snapshots mean no Redis rows to upsert; usage-window
					// expiry and rolling are handled outside sync-back.
					const parsedWindows = JSON.parse(value) as UsageWindow[];
					usageWindowUpdates.push({
						internal_customer_id: targets.internalCustomerId,
						feature_id: targets.featureIds[keyIndex],
						usage_windows: Array.isArray(parsedWindows) ? parsedWindows : [],
					});
				} else {
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
				}
			} catch {
				logger.warn(
					`[invalidateSharedBalanceFields] ${customerId}: unparseable balance field ${fields[fieldIndex]}, dropping it from flush`,
				);
			}
		}
	}

	return { subjectBalances, usageWindowUpdates };
}
