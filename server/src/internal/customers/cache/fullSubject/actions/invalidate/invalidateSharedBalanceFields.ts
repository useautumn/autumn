import {
	customerEntitlements,
	customers,
	features,
	InternalError,
	type SubjectBalance,
	type UsageWindow,
	usageWindows,
} from "@autumn/shared";
import { and, eq, or } from "drizzle-orm";
import type { Redis } from "ioredis";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { writeSubjectBalancesToDb } from "@/internal/balances/utils/sync/flushSubjectBalancesToDb.js";
import { withCustomerBalanceSyncLock } from "@/internal/balances/utils/sync/withCustomerBalanceSyncLock.js";
import type { UsageWindowUpdate } from "@/internal/balances/utils/types/usageWindowUpdate.js";
import { tryRedisRead, tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildFullSubjectKey } from "../../builders/buildFullSubjectKey.js";
import { buildSharedFullSubjectBalanceKey } from "../../builders/buildSharedFullSubjectBalanceKey.js";
import {
	AGGREGATED_BALANCE_FIELD,
	SUBJECT_VIEW_EPOCH_FIELD,
	USAGE_WINDOWS_FIELD,
} from "../../config/fullSubjectCacheConfig.js";
import type { CachedFullSubject } from "../../fullSubjectCacheModel.js";
import { roundSubjectBalance } from "../../roundCacheBalance.js";
import { sanitizeCachedSubjectBalance } from "../../sanitize/index.js";

// Kill switch: set to false to force the legacy blind-HDEL path everywhere,
// ignoring callers' flushBalances opt-in.
const FLUSH_BALANCES_ON_INVALIDATION = true;

export type SharedBalanceCaptureMode = "best_effort" | "strict";

const throwSharedBalanceCaptureFailure = ({
	customerId,
	stage,
	error,
}: {
	customerId: string;
	stage: string;
	error?: unknown;
}): never => {
	throw new InternalError({
		message: `Failed to capture shared FullSubject balances for '${customerId}' during ${stage}.`,
		code: "shared_balance_capture_failed",
		data: {
			stage,
			...(error instanceof Error ? { cause: error.message } : {}),
		},
	});
};

/**
 * Destructively reads (atomic read + HDEL) the shared balance hash fields for
 * a customer during structural invalidation, then flushes the values to
 * Postgres — an invalidation racing an un-synced deduction must not lose it.
 * No-op when the subject view is already gone; the next epoch's first cache
 * populate replaces each stale feature hash before filling it.
 *
 * Must be called BEFORE the subject view key is deleted.
 */
export const invalidateSharedBalanceFields = async ({
	ctx,
	customerId,
	redisV2 = ctx.redisV2,
	flushBalances = false,
	balanceSyncDb,
	balanceCaptureMode = "best_effort",
}: {
	ctx: AutumnContext;
	customerId: string;
	redisV2?: Redis;
	/** Flush cached balances to Postgres before deleting them. Opt-in: only
	 *  safe when the caller has NOT just written balances to Postgres directly
	 *  (the cached balances must still be the source of truth). */
	flushBalances?: boolean;
	/** Existing customer balance-sync transaction. Supplying this prevents a
	 * nested advisory-lock wait when a broader invalidation owns the lock. */
	balanceSyncDb?: DrizzleCli;
	/** Strict capture is reserved for mutations whose Postgres write would be
	 * corrupt if a live Redis-only deduction were mistaken for a cache miss. */
	balanceCaptureMode?: SharedBalanceCaptureMode;
}): Promise<void> => {
	const { org, env } = ctx;
	if (!customerId) return;
	if (redisV2.status !== "ready") {
		if (balanceCaptureMode === "strict") {
			throw new RedisUnavailableError({
				source: "captureSharedBalanceFields:not-ready",
				reason: "not_ready",
			});
		}
		return;
	}

	const subjectKey = buildFullSubjectKey({ orgId: org.id, env, customerId });
	if (!FLUSH_BALANCES_ON_INVALIDATION || !flushBalances) {
		const cachedRaw = await tryRedisRead(
			() => redisV2.get(subjectKey),
			redisV2,
		);
		if (!cachedRaw) return;
		await deleteFieldsFromManifest({ ctx, customerId, cachedRaw, redisV2 });
		return;
	}

	const captureAndFlush = async ({ db }: { db: DrizzleCli }) => {
		const captured = await captureAndDeleteSharedBalanceFields({
			ctx,
			customerId,
			redisV2,
			failureMode: balanceCaptureMode,
			resolveTargetsOnManifestMiss: () =>
				resolveBalanceFieldTargetsFromDb({ ctx, customerId, db }),
		});
		if (!captured) return;
		await writeSubjectBalancesToDb({
			db,
			subjectBalances: captured.subjectBalances,
			usageWindowUpdates: captured.usageWindowUpdates,
			queryName: "invalidateSharedBalanceFields",
		});
	};

	if (balanceSyncDb) {
		await captureAndFlush({ db: balanceSyncDb });
		return;
	}

	await withCustomerBalanceSyncLock({
		ctx,
		customerId,
		callback: captureAndFlush,
	});
};

export type BalanceFieldTargets = {
	internalCustomerId: string;
	featureIds: string[];
	balanceKeys: string[];
	customerEntitlementIdsByKey: string[][];
};

const buildBalanceFieldTargets = ({
	ctx,
	customerId,
	internalCustomerId,
	customerEntitlementIdsByFeatureId,
	usageWindowFeatureIds,
}: {
	ctx: AutumnContext;
	customerId: string;
	internalCustomerId: string;
	customerEntitlementIdsByFeatureId: Record<string, string[]>;
	usageWindowFeatureIds: string[];
}): BalanceFieldTargets | null => {
	const { org, env } = ctx;
	const featureIdSet = new Set([
		...Object.keys(customerEntitlementIdsByFeatureId),
		...usageWindowFeatureIds,
	]);
	if (featureIdSet.size === 0) return null;

	const featureIds: string[] = [];
	const balanceKeys: string[] = [];
	const customerEntitlementIdsByKey: string[][] = [];
	for (const featureId of featureIdSet) {
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
			customerEntitlementIdsByFeatureId[featureId] ?? [],
		);
	}

	return {
		internalCustomerId,
		featureIds,
		balanceKeys,
		customerEntitlementIdsByKey,
	};
};

const manifestToBalanceFieldTargets = ({
	ctx,
	customerId,
	cachedRaw,
	failureMode,
}: {
	ctx: AutumnContext;
	customerId: string;
	cachedRaw: string;
	failureMode: SharedBalanceCaptureMode;
}): BalanceFieldTargets | null => {
	const { logger } = ctx;

	let manifest: CachedFullSubject;
	try {
		manifest = JSON.parse(cachedRaw) as CachedFullSubject;
	} catch (error) {
		if (failureMode === "strict") {
			throwSharedBalanceCaptureFailure({
				customerId,
				stage: "manifest_parse",
				error,
			});
		}
		logger.warn(
			`[invalidateSharedBalanceFields] Failed to parse subject view for ${customerId}, skipping field deletion`,
		);
		return null;
	}

	const { customerEntitlementIdsByFeatureId } = manifest;
	if (
		!customerEntitlementIdsByFeatureId ||
		typeof manifest.internalCustomerId !== "string"
	) {
		if (failureMode === "strict") {
			throwSharedBalanceCaptureFailure({
				customerId,
				stage: "manifest_shape",
			});
		}
		return null;
	}

	// Capped features may have no entitlements, so their hashes only appear in
	// usageWindowFeatureIds; union both so `_usage_windows` is covered too.
	// Raw blob, no sanitize walker: cjson re-encodes empty arrays as {}, so
	// array fields must be Array.isArray-guarded before spreading.
	const usageWindowFeatureIds = Array.isArray(manifest.usageWindowFeatureIds)
		? manifest.usageWindowFeatureIds
		: [];
	return buildBalanceFieldTargets({
		ctx,
		customerId,
		internalCustomerId: manifest.internalCustomerId,
		customerEntitlementIdsByFeatureId: Object.fromEntries(
			Object.entries(customerEntitlementIdsByFeatureId).map(
				([featureId, rawCustomerEntitlementIds]) => [
					featureId,
					Array.isArray(rawCustomerEntitlementIds)
						? rawCustomerEntitlementIds
						: [],
				],
			),
		),
		usageWindowFeatureIds,
	});
};

const resolveBalanceFieldTargetsFromDb = async ({
	ctx,
	customerId,
	db,
}: {
	ctx: AutumnContext;
	customerId: string;
	db: DrizzleCli;
}): Promise<BalanceFieldTargets | null> => {
	const [customer] = await db
		.select({ internalCustomerId: customers.internal_id })
		.from(customers)
		.where(
			and(
				or(eq(customers.id, customerId), eq(customers.internal_id, customerId)),
				eq(customers.org_id, ctx.org.id),
				eq(customers.env, ctx.env),
			),
		)
		.limit(1);
	if (!customer) return null;

	const customerEntitlementRows = await db
		.select({
			id: customerEntitlements.id,
			featureId: features.id,
		})
		.from(customerEntitlements)
		.innerJoin(
			features,
			eq(customerEntitlements.internal_feature_id, features.internal_id),
		)
		.where(
			eq(
				customerEntitlements.internal_customer_id,
				customer.internalCustomerId,
			),
		);
	const usageWindowRows = await db
		.select({ featureId: usageWindows.feature_id })
		.from(usageWindows)
		.where(eq(usageWindows.internal_customer_id, customer.internalCustomerId));

	const customerEntitlementIdsByFeatureId: Record<string, string[]> = {};
	for (const customerEntitlement of customerEntitlementRows) {
		const existingIds =
			customerEntitlementIdsByFeatureId[customerEntitlement.featureId] ?? [];
		customerEntitlementIdsByFeatureId[customerEntitlement.featureId] = [
			...existingIds,
			customerEntitlement.id,
		];
	}

	return buildBalanceFieldTargets({
		ctx,
		customerId,
		internalCustomerId: customer.internalCustomerId,
		customerEntitlementIdsByFeatureId,
		usageWindowFeatureIds: [
			...new Set(usageWindowRows.map(({ featureId }) => featureId)),
		],
	});
};

const captureAndDeleteFieldsFromTargets = async ({
	ctx,
	customerId,
	redisV2,
	failureMode,
	targets,
}: {
	ctx: AutumnContext;
	customerId: string;
	redisV2: Redis;
	failureMode: SharedBalanceCaptureMode;
	targets: BalanceFieldTargets;
}): Promise<{
	subjectBalances: SubjectBalance[];
	usageWindowUpdates: UsageWindowUpdate[];
} | null> => {
	const { logger } = ctx;

	const { balanceKeys, customerEntitlementIdsByKey } = targets;
	if (balanceKeys.length === 0) {
		return { subjectBalances: [], usageWindowUpdates: [] };
	}

	// `_usage_windows` is read+deleted alongside the cusEnt fields (last field
	// per key) so window counters are flushed too, not just deleted.
	const fieldsByKey = customerEntitlementIdsByKey.map((cusEntIds) => [
		...cusEntIds,
		USAGE_WINDOWS_FIELD,
	]);

	const getDel = () =>
		redisV2.getDelFullSubjectBalanceFields(
			balanceKeys.length,
			...balanceKeys,
			JSON.stringify(fieldsByKey),
			JSON.stringify([AGGREGATED_BALANCE_FIELD, SUBJECT_VIEW_EPOCH_FIELD]),
		);
	const resultRaw =
		failureMode === "strict"
			? await runRedisOp({
					operation: getDel,
					source: "captureSharedBalanceFields:getdel",
					redisInstance: redisV2,
				})
			: await tryRedisWrite(getDel, redisV2);

	if (resultRaw === null) {
		if (failureMode === "strict") {
			throwSharedBalanceCaptureFailure({
				customerId,
				stage: "getdel_result",
			});
		}
		logger.warn(
			`[invalidateSharedBalanceFields] ${customerId}: GETDEL failed, skipping flush`,
		);
		return null;
	}

	const parsed = parseGetDelResult({
		ctx,
		customerId,
		resultRaw,
		targets,
		fieldsByKey,
		failureMode,
	});
	if (!parsed) return null;
	const { subjectBalances, usageWindowUpdates } = parsed;

	logger.info(
		`[invalidateSharedBalanceFields] ${customerId}: GETDEL ${balanceKeys.length} balance keys, flushing ${subjectBalances.length} balances, ${usageWindowUpdates.length} usage windows`,
	);

	return { subjectBalances, usageWindowUpdates };
};

/** Atomically captures and removes the current FullSubject balance fields.
 * The caller owns persistence/reconciliation and, when writing Postgres,
 * must already hold the customer balance-sync lock. */
export const captureAndDeleteSharedBalanceFields = async ({
	ctx,
	customerId,
	redisV2 = ctx.redisV2,
	failureMode = "best_effort",
	resolveTargetsOnManifestMiss,
}: {
	ctx: AutumnContext;
	customerId: string;
	redisV2?: Redis;
	failureMode?: SharedBalanceCaptureMode;
	resolveTargetsOnManifestMiss?: () => Promise<BalanceFieldTargets | null>;
}): Promise<{
	subjectBalances: SubjectBalance[];
	usageWindowUpdates: UsageWindowUpdate[];
} | null> => {
	if (!customerId) return null;
	if (redisV2.status !== "ready") {
		if (failureMode === "strict") {
			throw new RedisUnavailableError({
				source: "captureSharedBalanceFields:not-ready",
				reason: "not_ready",
			});
		}
		return null;
	}
	const subjectKey = buildFullSubjectKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
	});
	const cachedRaw =
		failureMode === "strict"
			? await runRedisOp({
					operation: () => redisV2.get(subjectKey),
					source: "captureSharedBalanceFields:get",
					redisInstance: redisV2,
				})
			: await tryRedisRead(() => redisV2.get(subjectKey), redisV2);
	const targets =
		cachedRaw === null
			? await resolveTargetsOnManifestMiss?.()
			: manifestToBalanceFieldTargets({
					ctx,
					customerId,
					cachedRaw,
					failureMode,
				});
	if (!targets) return null;
	return captureAndDeleteFieldsFromTargets({
		ctx,
		customerId,
		redisV2,
		failureMode,
		targets,
	});
};

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

	const targets = manifestToBalanceFieldTargets({
		ctx,
		customerId,
		cachedRaw,
		failureMode: "best_effort",
	});
	if (!targets) return;
	const { balanceKeys, customerEntitlementIdsByKey } = targets;

	const pipeline = redisV2.pipeline();
	let fieldCount = 0;

	for (let index = 0; index < balanceKeys.length; index++) {
		const fieldsToDelete = [
			...customerEntitlementIdsByKey[index],
			AGGREGATED_BALANCE_FIELD,
			SUBJECT_VIEW_EPOCH_FIELD,
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
	failureMode,
}: {
	ctx: AutumnContext;
	customerId: string;
	resultRaw: string;
	targets: BalanceFieldTargets;
	fieldsByKey: string[][];
	failureMode: SharedBalanceCaptureMode;
}): {
	subjectBalances: SubjectBalance[];
	usageWindowUpdates: UsageWindowUpdate[];
} | null {
	const { logger } = ctx;

	let valuesByKey: unknown[];
	try {
		valuesByKey = JSON.parse(resultRaw) as unknown[];
	} catch (error) {
		if (failureMode === "strict") {
			throwSharedBalanceCaptureFailure({
				customerId,
				stage: "getdel_parse",
				error,
			});
		}
		logger.warn(
			`[invalidateSharedBalanceFields] ${customerId}: failed to parse GETDEL result, skipping flush, error: ${error}`,
		);
		return null;
	}
	if (!Array.isArray(valuesByKey)) {
		if (failureMode === "strict") {
			throwSharedBalanceCaptureFailure({
				customerId,
				stage: "getdel_shape",
			});
		}
		return null;
	}
	if (failureMode === "strict" && valuesByKey.length !== fieldsByKey.length) {
		throwSharedBalanceCaptureFailure({
			customerId,
			stage: "getdel_key_count",
		});
	}

	const subjectBalances: SubjectBalance[] = [];
	const usageWindowUpdates: UsageWindowUpdate[] = [];

	for (let keyIndex = 0; keyIndex < fieldsByKey.length; keyIndex++) {
		const rawValues = valuesByKey[keyIndex];
		// cjson encodes empty Lua tables as {}, so each per-key entry must be
		// Array.isArray-guarded.
		if (!Array.isArray(rawValues) && failureMode === "strict") {
			throwSharedBalanceCaptureFailure({
				customerId,
				stage: "getdel_key_shape",
			});
		}
		const values = Array.isArray(rawValues) ? (rawValues as unknown[]) : [];
		const fields = fieldsByKey[keyIndex];

		for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex++) {
			const value = values[fieldIndex];
			if (value === null || value === undefined) continue;
			if (typeof value !== "string") {
				if (failureMode === "strict") {
					throwSharedBalanceCaptureFailure({
						customerId,
						stage: "field_shape",
					});
				}
				continue;
			}

			const isUsageWindowsField = fieldIndex === fields.length - 1;
			try {
				if (isUsageWindowsField) {
					// Empty/non-array snapshots mean no Redis rows to upsert; usage-window
					// expiry and rolling are handled outside sync-back.
					const parsedWindows = JSON.parse(value) as UsageWindow[];
					if (!Array.isArray(parsedWindows) && failureMode === "strict") {
						throw new Error("usage window snapshot is not an array");
					}
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
			} catch (error) {
				if (failureMode === "strict") {
					throwSharedBalanceCaptureFailure({
						customerId,
						stage: `field_parse:${fields[fieldIndex]}`,
						error,
					});
				}
				logger.warn(
					`[invalidateSharedBalanceFields] ${customerId}: unparseable balance field ${fields[fieldIndex]}, dropping it from flush`,
				);
			}
		}
	}

	return { subjectBalances, usageWindowUpdates };
}
