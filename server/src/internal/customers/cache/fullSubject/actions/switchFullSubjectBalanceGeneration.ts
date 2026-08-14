import type { NormalizedFullSubject } from "@autumn/shared";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { applyLiveAggregatedBalances } from "../balances/applyLiveAggregatedBalances.js";
import { applyLiveUsageWindows } from "../balances/applyLiveUsageWindows.js";
import type { FeatureBalanceResult } from "../balances/getCachedFeatureBalances.js";
import {
	buildFullSubjectBalanceGenerationKey,
	buildFullSubjectBalanceHandoffLockKey,
} from "../builders/buildFullSubjectBalanceGenerationKey.js";
import { buildFullSubjectKey } from "../builders/buildFullSubjectKey.js";
import { buildFullSubjectViewEpochKey } from "../builders/buildFullSubjectViewEpochKey.js";
import { buildSharedFullSubjectBalanceKey } from "../builders/buildSharedFullSubjectBalanceKey.js";
import {
	AGGREGATED_BALANCE_FIELD,
	FULL_SUBJECT_CACHE_TTL_SECONDS,
	FULL_SUBJECT_EPOCH_TTL_SECONDS,
	USAGE_WINDOWS_FIELD,
} from "../config/fullSubjectCacheConfig.js";
import {
	type CachedFullSubject,
	cachedFullSubjectToNormalized,
	normalizedToCachedFullSubject,
} from "../fullSubjectCacheModel.js";
import { roundSubjectBalance } from "../roundCacheBalance.js";
import {
	sanitizeCachedAggregatedFeatureBalance,
	sanitizeCachedFullSubject,
	sanitizeCachedSubjectBalance,
} from "../sanitize/index.js";
import {
	buildSharedBalanceWrites,
	type SharedBalanceWrite,
} from "./setCachedFullSubject/setSharedFullSubjectBalances.js";

const MAX_SUBJECT_DISCOVERY_ATTEMPTS = 3;
const MAX_SWITCH_ATTEMPTS = 5;

type ExpectedBalanceField = {
	name: string;
	rawValue: string | null;
};

type BalanceHashSnapshot = {
	featureId: string;
	key: string;
	fields: ExpectedBalanceField[];
};

type BalanceGenerationSnapshot = {
	expectedGeneration: number;
	cached: CachedFullSubject;
	normalized: NormalizedFullSubject;
	rawSubjectJson: string;
	rawSubjectViewEpoch: string | null;
	balanceHashes: BalanceHashSnapshot[];
};

type BalanceGenerationTarget = {
	normalized: NormalizedFullSubject;
	rawSubjectJson: string;
	writes: SharedBalanceWrite[];
};

type CacheFailure = {
	status: "cache_missing" | "conflict";
	reason: string;
};

type SnapshotResult<T> = { status: "ok"; snapshot: T } | CacheFailure;

type SwitchFullSubjectBalanceGenerationResult =
	| { status: "switched" }
	| CacheFailure;

type RedisCommandResult = [Error | null, unknown];

const getCommandValue = <T>({
	results,
	index,
}: {
	results: RedisCommandResult[];
	index: number;
}): T => {
	const result = results[index];
	if (!result) throw new Error(`Missing Redis transaction result at ${index}`);
	if (result[0]) throw result[0];
	return result[1] as T;
};

const parseNonNegativeInteger = (raw: string): number | undefined => {
	if (!/^(0|[1-9]\d*)$/.test(raw)) return undefined;
	const parsed = Number(raw);
	return Number.isSafeInteger(parsed) ? parsed : undefined;
};

const parseCachedSubject = (
	rawSubjectJson: string,
): CachedFullSubject | undefined => {
	try {
		return sanitizeCachedFullSubject({
			cachedFullSubject: JSON.parse(rawSubjectJson) as CachedFullSubject,
		});
	} catch {
		return undefined;
	}
};

const getManifestFeatureIds = (cached: CachedFullSubject): string[] =>
	[
		...new Set([
			...Object.keys(cached.customerEntitlementIdsByFeatureId ?? {}),
			...(cached.meteredFeatures ?? []),
			...(cached.usageWindowFeatureIds ?? []),
		]),
	].sort();

const getOwnedFieldNames = ({
	cached,
	featureId,
}: {
	cached: CachedFullSubject;
	featureId: string;
}): string[] => {
	const fields = [
		...(cached.customerEntitlementIdsByFeatureId[featureId] ?? []),
	];
	if (cached.entityId) return fields;

	fields.push(AGGREGATED_BALANCE_FIELD);
	if (cached.usageWindowFeatureIds?.includes(featureId)) {
		fields.push(USAGE_WINDOWS_FIELD);
	}
	return fields;
};

const buildGenerationKeys = ({
	ctx,
	customerId,
	entityId,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
}) => ({
	subjectKey: buildFullSubjectKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		entityId,
	}),
	subjectViewEpochKey: buildFullSubjectViewEpochKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
	}),
	balanceGenerationKey: buildFullSubjectBalanceGenerationKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
	}),
	balanceHandoffLockKey: buildFullSubjectBalanceHandoffLockKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
	}),
});

const hydrateSnapshotSubject = ({
	cached,
	balanceHashes,
}: {
	cached: CachedFullSubject;
	balanceHashes: BalanceHashSnapshot[];
}): SnapshotResult<NormalizedFullSubject> => {
	const fieldsByFeatureId = new Map(
		balanceHashes.map((balanceHash) => [
			balanceHash.featureId,
			new Map(balanceHash.fields.map((field) => [field.name, field.rawValue])),
		]),
	);
	const featureBalances: FeatureBalanceResult[] = [];

	for (const featureId of getManifestFeatureIds(cached)) {
		const fields = fieldsByFeatureId.get(featureId) ?? new Map();
		const balances: NormalizedFullSubject["customer_entitlements"] = [];

		for (const customerEntitlementId of cached
			.customerEntitlementIdsByFeatureId[featureId] ?? []) {
			const rawBalance = fields.get(customerEntitlementId);
			if (rawBalance === undefined || rawBalance === null) {
				return {
					status: "cache_missing",
					reason: `balance_field_missing:${featureId}:${customerEntitlementId}`,
				};
			}

			try {
				balances.push(
					roundSubjectBalance({
						subjectBalance: sanitizeCachedSubjectBalance({
							subjectBalance: JSON.parse(rawBalance),
						}),
					}),
				);
			} catch {
				return {
					status: "conflict",
					reason: `balance_field_malformed:${featureId}:${customerEntitlementId}`,
				};
			}
		}

		let aggregated: FeatureBalanceResult["aggregated"];
		const rawAggregated = fields.get(AGGREGATED_BALANCE_FIELD);
		if (!cached.entityId && rawAggregated) {
			try {
				aggregated = sanitizeCachedAggregatedFeatureBalance({
					aggregated: JSON.parse(rawAggregated),
				});
			} catch {
				// Keep the structural value embedded in the subject.
			}
		}

		let usageWindows: FeatureBalanceResult["usageWindows"];
		if (!cached.entityId && cached.usageWindowFeatureIds?.includes(featureId)) {
			try {
				const parsed = JSON.parse(fields.get(USAGE_WINDOWS_FIELD) ?? "[]");
				usageWindows = Array.isArray(parsed) ? parsed : [];
			} catch {
				usageWindows = [];
			}
		}

		featureBalances.push({ featureId, balances, aggregated, usageWindows });
	}

	const normalized = cachedFullSubjectToNormalized({
		cached: structuredClone(cached),
		customerEntitlements: featureBalances.flatMap(
			(featureBalance) => featureBalance.balances,
		),
	});
	if (!cached.entityId) {
		applyLiveAggregatedBalances({ normalized, featureBalances });
	}
	applyLiveUsageWindows({ normalized, featureBalances });

	return { status: "ok", snapshot: normalized };
};

const readExactSnapshot = async ({
	ctx,
	customerId,
	entityId,
	additionalFieldsByFeatureId,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	additionalFieldsByFeatureId: Map<string, Set<string>>;
}): Promise<SnapshotResult<BalanceGenerationSnapshot>> => {
	const { org, env, redisV2 } = ctx;
	const { subjectKey, subjectViewEpochKey, balanceGenerationKey } =
		buildGenerationKeys({ ctx, customerId, entityId });

	return runRedisOp({
		operation: async (redis) => {
			for (
				let attempt = 0;
				attempt < MAX_SUBJECT_DISCOVERY_ATTEMPTS;
				attempt++
			) {
				const discoveredSubjectJson = await redis.get(subjectKey);
				if (discoveredSubjectJson === null) {
					return { status: "cache_missing", reason: "subject_missing" };
				}

				const discoveredCached = parseCachedSubject(discoveredSubjectJson);
				if (!discoveredCached) {
					return { status: "conflict", reason: "subject_malformed" };
				}

				const featureIds = [
					...new Set([
						...getManifestFeatureIds(discoveredCached),
						...additionalFieldsByFeatureId.keys(),
					]),
				].sort();
				const hashReads = featureIds.flatMap((featureId) => {
					const fieldNames = [
						...new Set([
							...getOwnedFieldNames({ cached: discoveredCached, featureId }),
							...(additionalFieldsByFeatureId.get(featureId) ?? []),
						]),
					].sort();
					if (fieldNames.length === 0) return [];
					return [
						{
							featureId,
							fieldNames,
							key: buildSharedFullSubjectBalanceKey({
								orgId: org.id,
								env,
								customerId,
								featureId,
							}),
						},
					];
				});

				const transaction = redis
					.multi()
					.mget(subjectKey, subjectViewEpochKey, balanceGenerationKey);
				for (const hashRead of hashReads) {
					transaction.hmget(hashRead.key, ...hashRead.fieldNames);
				}
				const rawResults = await transaction.exec();
				if (!rawResults) {
					throw new Error("Redis snapshot transaction returned null");
				}
				const results = rawResults as RedisCommandResult[];

				const [rawSubjectJson, rawSubjectViewEpoch, rawBalanceGeneration] =
					getCommandValue<(string | null)[]>({ results, index: 0 });
				if (rawSubjectJson === null) {
					return { status: "cache_missing", reason: "subject_missing" };
				}
				if (rawSubjectJson !== discoveredSubjectJson) continue;
				if (
					discoveredCached.customerId !== customerId ||
					discoveredCached.entityId !== entityId
				) {
					return { status: "conflict", reason: "subject_identity_mismatch" };
				}

				const subjectViewEpoch =
					rawSubjectViewEpoch === null
						? 0
						: parseNonNegativeInteger(rawSubjectViewEpoch);
				if (
					subjectViewEpoch === undefined ||
					discoveredCached.subjectViewEpoch !== subjectViewEpoch
				) {
					return { status: "conflict", reason: "subject_view_epoch_mismatch" };
				}
				if (rawBalanceGeneration === null) {
					return { status: "cache_missing", reason: "generation_missing" };
				}
				const expectedGeneration =
					parseNonNegativeInteger(rawBalanceGeneration);
				if (
					expectedGeneration === undefined ||
					discoveredCached.balanceGeneration !== expectedGeneration
				) {
					return { status: "conflict", reason: "generation_mismatch" };
				}

				const balanceHashes = hashReads.map((hashRead, index) => {
					const rawFields = getCommandValue<(string | null)[]>({
						results,
						index: index + 1,
					});
					if (rawFields.length !== hashRead.fieldNames.length) {
						throw new Error("Redis balance field result length mismatch");
					}
					return {
						featureId: hashRead.featureId,
						key: hashRead.key,
						fields: hashRead.fieldNames.map((name, fieldIndex) => ({
							name,
							rawValue: rawFields[fieldIndex] ?? null,
						})),
					};
				});
				const hydrated = hydrateSnapshotSubject({
					cached: discoveredCached,
					balanceHashes,
				});
				if (hydrated.status !== "ok") return hydrated;

				return {
					status: "ok",
					snapshot: {
						expectedGeneration,
						cached: discoveredCached,
						normalized: hydrated.snapshot,
						rawSubjectJson,
						rawSubjectViewEpoch,
						balanceHashes,
					},
				};
			}

			return { status: "conflict", reason: "subject_changed_during_snapshot" };
		},
		source: "switchFullSubjectBalanceGeneration:readSnapshot",
		redisInstance: redisV2,
	});
};

const buildTarget = ({
	ctx,
	snapshot,
	normalized,
}: {
	ctx: AutumnContext;
	snapshot: BalanceGenerationSnapshot;
	normalized: NormalizedFullSubject;
}):
	| { status: "ok"; target: BalanceGenerationTarget }
	| { status: "needs_snapshot"; fieldsByFeatureId: Map<string, string[]> }
	| { status: "conflict"; reason: string } => {
	if (
		normalized.subjectType !== snapshot.normalized.subjectType ||
		normalized.customerId !== snapshot.normalized.customerId ||
		normalized.internalCustomerId !== snapshot.normalized.internalCustomerId ||
		normalized.entityId !== snapshot.normalized.entityId ||
		normalized.internalEntityId !== snapshot.normalized.internalEntityId
	) {
		return { status: "conflict", reason: "target_identity_mismatch" };
	}

	const targetNormalized = structuredClone(normalized);
	targetNormalized.balanceGeneration = snapshot.expectedGeneration + 1;
	const targetCached = normalizedToCachedFullSubject({
		normalized: targetNormalized,
		subjectViewEpoch: snapshot.cached.subjectViewEpoch + 1,
	});
	const isCustomerSubject = !snapshot.normalized.entityId;
	const writes = buildSharedBalanceWrites({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId: snapshot.normalized.customerId,
		customerEntitlements: targetNormalized.customer_entitlements,
		aggregatedCustomerEntitlements: isCustomerSubject
			? (targetNormalized.entity_aggregations
					?.aggregated_customer_entitlements ?? [])
			: [],
		usageWindows: isCustomerSubject
			? (targetNormalized.usage_windows ?? [])
			: [],
		usageWindowFeatureIds: isCustomerSubject
			? targetCached.usageWindowFeatureIds
			: [],
	});
	const snapshottedFieldsByKey = new Map(
		snapshot.balanceHashes.map((balanceHash) => [
			balanceHash.key,
			new Set(balanceHash.fields.map((field) => field.name)),
		]),
	);
	const writesByKey = new Map(
		writes.map((write) => [write.balanceKey, write.fields]),
	);
	const fieldsByFeatureId = new Map<string, string[]>();
	for (const featureId of getManifestFeatureIds(targetCached)) {
		const balanceKey = buildSharedFullSubjectBalanceKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: snapshot.normalized.customerId,
			featureId,
		});
		const snapshottedFields = snapshottedFieldsByKey.get(balanceKey);
		const missingFields = Object.keys(writesByKey.get(balanceKey) ?? {}).filter(
			(fieldName) => !snapshottedFields?.has(fieldName),
		);
		if (missingFields.length > 0) {
			fieldsByFeatureId.set(featureId, missingFields);
		}
	}
	if (fieldsByFeatureId.size > 0) {
		return { status: "needs_snapshot", fieldsByFeatureId };
	}

	return {
		status: "ok",
		target: {
			normalized: targetNormalized,
			rawSubjectJson: JSON.stringify(targetCached),
			writes,
		},
	};
};

export const switchFullSubjectBalanceGeneration = async ({
	ctx,
	customerId,
	entityId,
	expectedGeneration,
	lockToken,
	buildTargetFromSnapshot,
	prepareTargetForSwitch,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	expectedGeneration: number;
	lockToken: string;
	buildTargetFromSnapshot: (args: {
		snapshot: BalanceGenerationSnapshot;
	}) => NormalizedFullSubject | Promise<NormalizedFullSubject>;
	prepareTargetForSwitch?: (args: {
		snapshot: BalanceGenerationSnapshot;
		target: BalanceGenerationTarget;
	}) => void | Promise<void>;
}): Promise<SwitchFullSubjectBalanceGenerationResult> => {
	const {
		subjectKey,
		subjectViewEpochKey,
		balanceGenerationKey,
		balanceHandoffLockKey,
	} = buildGenerationKeys({ ctx, customerId, entityId });
	const additionalFieldsByFeatureId = new Map<string, Set<string>>();

	for (let attempt = 0; attempt < MAX_SWITCH_ATTEMPTS; attempt++) {
		const snapshotResult = await readExactSnapshot({
			ctx,
			customerId,
			entityId,
			additionalFieldsByFeatureId,
		});
		if (snapshotResult.status !== "ok") return snapshotResult;
		const { snapshot } = snapshotResult;
		if (snapshot.expectedGeneration !== expectedGeneration) {
			return { status: "conflict", reason: "unexpected_generation" };
		}

		const targetResult = buildTarget({
			ctx,
			snapshot,
			normalized: await buildTargetFromSnapshot({ snapshot }),
		});
		if (targetResult.status === "conflict") return targetResult;
		if (targetResult.status === "needs_snapshot") {
			for (const [featureId, fieldNames] of targetResult.fieldsByFeatureId) {
				const requestedFields =
					additionalFieldsByFeatureId.get(featureId) ?? new Set<string>();
				for (const fieldName of fieldNames) requestedFields.add(fieldName);
				additionalFieldsByFeatureId.set(featureId, requestedFields);
			}
			continue;
		}
		const { target } = targetResult;
		await prepareTargetForSwitch?.({ snapshot, target });

		const writesByKey = new Map(
			target.writes.map((write) => [write.balanceKey, write.fields]),
		);
		const keys = [
			subjectKey,
			subjectViewEpochKey,
			balanceGenerationKey,
			balanceHandoffLockKey,
			...snapshot.balanceHashes.map((balanceHash) => balanceHash.key),
		];
		const rawResult = await runRedisOp({
			operation: (redis) =>
				redis.switchFullSubjectBalanceGeneration(
					keys.length,
					...keys,
					JSON.stringify({
						expected_subject_json: snapshot.rawSubjectJson,
						expected_subject_view_epoch_exists:
							snapshot.rawSubjectViewEpoch !== null,
						expected_subject_view_epoch: snapshot.rawSubjectViewEpoch ?? "",
						expected_generation: String(snapshot.expectedGeneration),
						lock_token: lockToken,
						next_subject_json: target.rawSubjectJson,
						ttl_seconds: FULL_SUBJECT_CACHE_TTL_SECONDS,
						epoch_ttl_seconds: FULL_SUBJECT_EPOCH_TTL_SECONDS,
						balance_hashes: snapshot.balanceHashes.map((balanceHash) => {
							const writes = writesByKey.get(balanceHash.key) ?? {};
							const targetFieldNames = new Set(Object.keys(writes));
							return {
								expected_fields: balanceHash.fields.map((field) => ({
									name: field.name,
									exists: field.rawValue !== null,
									value: field.rawValue ?? "",
								})),
								deletes: getOwnedFieldNames({
									cached: snapshot.cached,
									featureId: balanceHash.featureId,
								}).filter((fieldName) => !targetFieldNames.has(fieldName)),
								writes,
							};
						}),
					}),
				),
			source: "switchFullSubjectBalanceGeneration:switch",
			redisInstance: ctx.redisV2,
		});

		if (rawResult === "OK") return { status: "switched" };
		if (rawResult === "CACHE_MISSING") {
			return { status: "cache_missing", reason: "cache_missing_during_switch" };
		}
	}

	return { status: "conflict", reason: "cache_kept_changing_during_switch" };
};
