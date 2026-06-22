import type {
	AggregatedFeatureBalance,
	SubjectBalance,
	UsageWindow,
} from "@autumn/shared";
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

const readFeatureBalancesFromMaster = async ({
	ctx,
	balanceKey,
	customerEntitlementIds,
}: {
	ctx: AutumnContext;
	balanceKey: string;
	customerEntitlementIds: string[];
}): Promise<(string | null)[] | null> => {
	const { redisV2 } = ctx;
	const multi = redisV2.multi();
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
		operation: () =>
			readMaster
				? readFeatureBalancesFromMaster({
						ctx,
						balanceKey,
						customerEntitlementIds,
					})
				: redisV2.hmget(balanceKey, ...customerEntitlementIds),
		source: "getCachedFeatureBalance",
		redisInstance: redisV2,
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
	const pipeline = redisV2.pipeline();
	for (const featureId of featureIds) {
		const customerEntitlementIds =
			customerEntitlementIdsByFeatureId[featureId] ?? [];
		const fields = [...customerEntitlementIds];
		if (includeAggregated) fields.push(AGGREGATED_BALANCE_FIELD);
		if (usageWindowFeatureIds?.has(featureId)) {
			fields.push(USAGE_WINDOWS_FIELD);
		}
		pipeline.hmget(
			buildSharedFullSubjectBalanceKey({
				orgId: org.id,
				env,
				customerId,
				featureId,
			}),
			...fields,
		);
	}

	const results = await runRedisOp({
		operation: () => pipeline.exec(),
		source: "getCachedFeatureBalancesBatch",
		redisInstance: redisV2,
	});

	if (!results) return { kind: "missing", reason: "batch_pipeline_null" };

	const featureBalances: FeatureBalanceResult[] = [];

	for (let i = 0; i < featureIds.length; i++) {
		const customerEntitlementIds =
			customerEntitlementIdsByFeatureId[featureIds[i]] ?? [];
		const allValues = results[i]?.[1] as (string | null)[] | null;
		if (!allValues)
			return {
				kind: "missing",
				reason: `batch_hash_missing:${featureIds[i]}`,
			};

		let aggregated: AggregatedFeatureBalance | undefined;
		let usageWindows: UsageWindow[] | undefined;

		// Pop reserved fields in reverse push order: [_aggregated?, _usage_windows?].
		if (usageWindowFeatureIds?.has(featureIds[i])) {
			usageWindows = parseUsageWindowsField(allValues.pop() ?? null);
		}

		if (includeAggregated) {
			const aggregatedJson = allValues.pop() ?? null;
			if (aggregatedJson) {
				try {
					const parsed = JSON.parse(aggregatedJson) as AggregatedFeatureBalance;
					aggregated = sanitizeCachedAggregatedFeatureBalance({
						aggregated: parsed,
					});
				} catch {
					// Malformed _aggregated is non-fatal; fall back to subject string value
				}
			}
		}

		const ceValues = allValues;

		if (ceValues.length !== customerEntitlementIds.length)
			return {
				kind: "missing",
				reason: `batch_length_mismatch:${featureIds[i]}:got=${ceValues.length}:expected=${customerEntitlementIds.length}`,
			};

		const balances: SubjectBalance[] = [];
		for (let j = 0; j < ceValues.length; j++) {
			const entryJson = ceValues[j];
			if (!entryJson)
				return {
					kind: "missing",
					reason: `batch_field_null:${featureIds[i]}:${customerEntitlementIds[j]}`,
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
					reason: `batch_parse_failed:${featureIds[i]}:${customerEntitlementIds[j]}`,
				};
			}
		}

		featureBalances.push({
			featureId: featureIds[i],
			balances,
			aggregated,
			usageWindows,
		});
	}

	return { kind: "ok", value: featureBalances };
};
