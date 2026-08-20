import type {
	AggregatedFeatureBalance,
	SubjectBalance,
	UsageWindow,
} from "@autumn/shared";
import type { ChainableCommander, Redis } from "ioredis";
import { throwOnPipelineConnectionError } from "@/external/redis/utils/pipelineErrors.js";
import { REDIS_OP_TIMEOUT_MS } from "@/external/redis/utils/redisOpTimeouts.js";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildSharedFullSubjectBalanceKey } from "../builders/buildSharedFullSubjectBalanceKey.js";
import {
	AGGREGATED_BALANCE_FIELD,
	USAGE_WINDOWS_FIELD,
} from "../config/fullSubjectCacheConfig.js";
import { roundSubjectBalance } from "../roundCacheBalance.js";
import {
	sanitizeCachedAggregatedFeatureBalance,
	sanitizeCachedSubjectBalance,
} from "../sanitize/index.js";

export type FeatureBalanceResult = {
	featureId: string;
	balances: SubjectBalance[];
	aggregated?: AggregatedFeatureBalance;
	/** Customer-scoped windowed-cap counters for this feature; only present for
	 *  features in the requested usageWindowFeatureIds set. */
	usageWindows?: UsageWindow[];
};

// Fail open: a missing/unparseable `_usage_windows` field reads as an empty
// counter set (the window restarts). cjson also encodes an empty Lua table as
// `{}`, so a non-array blob is an empty set, not corruption.
const parseUsageWindowsField = (
	usageWindowsJson: string | null,
): UsageWindow[] => {
	if (!usageWindowsJson) return [];
	try {
		const parsed = JSON.parse(usageWindowsJson);
		return Array.isArray(parsed) ? (parsed as UsageWindow[]) : [];
	} catch {
		return [];
	}
};

export type FeatureBalanceOutcome =
	| { kind: "ok"; value: FeatureBalanceResult }
	| { kind: "missing"; reason: string };

export type FeatureBalancesBatchOutcome =
	| { kind: "ok"; value: FeatureBalanceResult[] }
	| { kind: "missing"; reason: string };

export type FeatureBalancesBatchRead = {
	featureIds: string[];
	customerEntitlementIdsByFeatureId: Record<string, string[]>;
	includeAggregated: boolean;
	usageWindowFeatureIds?: Set<string>;
};

export const appendCachedFeatureBalanceReads = ({
	pipeline,
	orgId,
	env,
	customerId,
	read,
}: {
	pipeline: ChainableCommander;
	orgId: string;
	env: string;
	customerId: string;
	read: FeatureBalancesBatchRead;
}): void => {
	for (const featureId of read.featureIds) {
		const customerEntitlementIds =
			read.customerEntitlementIdsByFeatureId[featureId] ?? [];
		const fields = [...customerEntitlementIds];
		if (read.includeAggregated) fields.push(AGGREGATED_BALANCE_FIELD);
		if (read.usageWindowFeatureIds?.has(featureId)) {
			fields.push(USAGE_WINDOWS_FIELD);
		}
		pipeline.hmget(
			buildSharedFullSubjectBalanceKey({
				orgId,
				env,
				customerId,
				featureId,
			}),
			...fields,
		);
	}
};

export const parseCachedFeatureBalanceReads = ({
	results,
	read,
}: {
	results: unknown[] | null | undefined;
	read: FeatureBalancesBatchRead;
}): FeatureBalancesBatchOutcome => {
	if (!results) return { kind: "missing", reason: "batch_pipeline_null" };

	const featureBalances: FeatureBalanceResult[] = [];

	for (let i = 0; i < read.featureIds.length; i++) {
		const featureId = read.featureIds[i];
		const customerEntitlementIds =
			read.customerEntitlementIdsByFeatureId[featureId] ?? [];
		const result = results[i] as [Error | null, unknown] | undefined;
		if (result?.[0]) throw result[0];
		const allValues = result?.[1] as (string | null)[] | null | undefined;
		if (!allValues) {
			return {
				kind: "missing",
				reason: `batch_hash_missing:${featureId}`,
			};
		}

		let aggregated: AggregatedFeatureBalance | undefined;
		let usageWindows: UsageWindow[] | undefined;

		if (read.usageWindowFeatureIds?.has(featureId)) {
			usageWindows = parseUsageWindowsField(allValues.pop() ?? null);
		}

		if (read.includeAggregated) {
			const aggregatedJson = allValues.pop() ?? null;
			if (aggregatedJson) {
				try {
					const parsed = JSON.parse(aggregatedJson) as AggregatedFeatureBalance;
					aggregated = sanitizeCachedAggregatedFeatureBalance({
						aggregated: parsed,
					});
				} catch {
					// Malformed aggregation falls back to the subject snapshot.
				}
			}
		}

		if (allValues.length !== customerEntitlementIds.length) {
			return {
				kind: "missing",
				reason: `batch_length_mismatch:${featureId}:got=${allValues.length}:expected=${customerEntitlementIds.length}`,
			};
		}

		const balances: SubjectBalance[] = [];
		for (let j = 0; j < allValues.length; j++) {
			const entryJson = allValues[j];
			if (!entryJson) {
				return {
					kind: "missing",
					reason: `batch_field_null:${featureId}:${customerEntitlementIds[j]}`,
				};
			}
			try {
				const parsedBalance = JSON.parse(entryJson) as SubjectBalance;
				balances.push(
					roundSubjectBalance({
						subjectBalance: sanitizeCachedSubjectBalance({
							subjectBalance: parsedBalance,
						}),
					}),
				);
			} catch {
				return {
					kind: "missing",
					reason: `batch_parse_failed:${featureId}:${customerEntitlementIds[j]}`,
				};
			}
		}

		featureBalances.push({
			featureId,
			balances,
			aggregated,
			usageWindows,
		});
	}

	return { kind: "ok", value: featureBalances };
};

export const parseCachedFeatureBalanceHashReads = ({
	results,
	read,
}: {
	results: unknown[] | null | undefined;
	read: FeatureBalancesBatchRead;
}): FeatureBalancesBatchOutcome => {
	if (!results) return { kind: "missing", reason: "hash_pipeline_null" };

	const orderedResults = read.featureIds.map((featureId, index) => {
		const result = results[index] as [Error | null, unknown] | undefined;
		if (result?.[0]) return result;
		const fields = (result?.[1] ?? {}) as Record<string, string>;
		const values: Array<string | null> = (
			read.customerEntitlementIdsByFeatureId[featureId] ?? []
		).map((customerEntitlementId) => fields[customerEntitlementId] ?? null);
		if (read.includeAggregated) {
			values.push(fields[AGGREGATED_BALANCE_FIELD] ?? null);
		}
		if (read.usageWindowFeatureIds?.has(featureId)) {
			values.push(fields[USAGE_WINDOWS_FIELD] ?? null);
		}
		return [null, values];
	});

	return parseCachedFeatureBalanceReads({ results: orderedResults, read });
};

const readFeatureBalancesFromMaster = async ({
	redis,
	balanceKey,
	customerEntitlementIds,
}: {
	redis: Redis;
	balanceKey: string;
	customerEntitlementIds: string[];
}): Promise<(string | null)[] | null> => {
	const multi = redis.multi();
	multi.hmget(balanceKey, ...customerEntitlementIds);
	const multiResults = await multi.exec();
	const firstResult = multiResults?.[0];
	if (!firstResult) return null;

	const [commandError, values] = firstResult;
	if (commandError) throw commandError;
	return (values ?? null) as (string | null)[] | null;
};

export const getCachedFeatureBalance = async ({
	ctx,
	customerId,
	featureId,
	customerEntitlementIds,
	readMaster = false,
}: {
	ctx: AutumnContext;
	customerId: string;
	featureId: string;
	customerEntitlementIds: string[];
	readMaster?: boolean;
}): Promise<FeatureBalanceOutcome> => {
	const { org, env, redisV2 } = ctx;
	const balanceKey = buildSharedFullSubjectBalanceKey({
		orgId: org.id,
		env,
		customerId,
		featureId,
	});

	if (customerEntitlementIds.length === 0) {
		return { kind: "ok", value: { featureId, balances: [] } };
	}

	const results = await runRedisOp({
		operation: (redis) =>
			readMaster
				? readFeatureBalancesFromMaster({
						redis,
						balanceKey,
						customerEntitlementIds,
					})
				: redis.hmget(balanceKey, ...customerEntitlementIds),
		source: "getCachedFeatureBalance",
		redisInstance: redisV2,
		// readMaster demands same-socket ordering: a standby retry could land
		// before an in-flight write on the dying primary socket.
		retryOnStandby: !readMaster,
		useReadPool: !readMaster,
		timeoutMs: REDIS_OP_TIMEOUT_MS.featureBalances,
	});

	if (!results) return { kind: "missing", reason: "single_pipeline_null" };

	const balances: SubjectBalance[] = [];
	for (let i = 0; i < customerEntitlementIds.length; i++) {
		const entryJson = results[i];
		if (!entryJson)
			return {
				kind: "missing",
				reason: `single_field_null:${featureId}:${customerEntitlementIds[i]}`,
			};
		try {
			const parsedBalance = JSON.parse(entryJson) as SubjectBalance;
			balances.push(
				roundSubjectBalance({
					subjectBalance: sanitizeCachedSubjectBalance({
						subjectBalance: parsedBalance,
					}),
				}),
			);
		} catch {
			return {
				kind: "missing",
				reason: `single_parse_failed:${featureId}:${customerEntitlementIds[i]}`,
			};
		}
	}

	return { kind: "ok", value: { featureId, balances } };
};

export const getCachedFeatureBalancesBatch = async ({
	ctx,
	customerId,
	featureIds,
	customerEntitlementIdsByFeatureId,
	includeAggregated = false,
	usageWindowFeatureIds,
}: {
	ctx: AutumnContext;
	customerId: string;
	featureIds: string[];
	customerEntitlementIdsByFeatureId: Record<string, string[]>;
	includeAggregated?: boolean;
	/** Features with an armed windowed cap: their `_usage_windows` field is
	 *  read too. A missing field fails open (reads as an empty counter set). */
	usageWindowFeatureIds?: Set<string>;
}): Promise<FeatureBalancesBatchOutcome> => {
	if (featureIds.length === 0) return { kind: "ok", value: [] };

	const { org, env, redisV2 } = ctx;
	const read: FeatureBalancesBatchRead = {
		featureIds,
		customerEntitlementIdsByFeatureId,
		includeAggregated,
		usageWindowFeatureIds,
	};
	const results = await runRedisOp({
		operation: (redis) => {
			const pipeline = redis.pipeline();
			appendCachedFeatureBalanceReads({
				pipeline,
				orgId: org.id,
				env,
				customerId,
				read,
			});
			return pipeline.exec().then(throwOnPipelineConnectionError);
		},
		source: "getCachedFeatureBalancesBatch",
		redisInstance: redisV2,
		retryOnStandby: true,
		useReadPool: true,
		timeoutMs: REDIS_OP_TIMEOUT_MS.featureBalancesBatch,
	});

	return parseCachedFeatureBalanceReads({ results, read });
};
