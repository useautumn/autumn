import type { AggregatedFeatureBalance, SubjectBalance } from "@autumn/shared";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildSharedFullSubjectBalanceKey } from "../builders/buildSharedFullSubjectBalanceKey.js";
import { AGGREGATED_BALANCE_FIELD } from "../config/fullSubjectCacheConfig.js";
import { roundSubjectBalance } from "../roundCacheBalance.js";
import {
	sanitizeCachedAggregatedFeatureBalance,
	sanitizeCachedSubjectBalance,
} from "../sanitize/index.js";

export type FeatureBalanceResult = {
	featureId: string;
	balances: SubjectBalance[];
	aggregated?: AggregatedFeatureBalance;
};

export type FeatureBalanceOutcome =
	| { kind: "ok"; value: FeatureBalanceResult }
	| { kind: "missing" };

export type FeatureBalancesBatchOutcome =
	| { kind: "ok"; value: FeatureBalanceResult[] }
	| { kind: "missing" };

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

	if (!results) return { kind: "missing" };

	const balances: SubjectBalance[] = [];
	for (let i = 0; i < customerEntitlementIds.length; i++) {
		const entryJson = results[i];
		if (!entryJson) return { kind: "missing" };
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
			return { kind: "missing" };
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
}: {
	ctx: AutumnContext;
	customerId: string;
	featureIds: string[];
	customerEntitlementIdsByFeatureId: Record<string, string[]>;
	includeAggregated?: boolean;
}): Promise<FeatureBalancesBatchOutcome> => {
	if (featureIds.length === 0) return { kind: "ok", value: [] };

	const { org, env, redisV2 } = ctx;
	const pipeline = redisV2.pipeline();
	for (const featureId of featureIds) {
		const customerEntitlementIds =
			customerEntitlementIdsByFeatureId[featureId] ?? [];
		const fields = includeAggregated
			? [...customerEntitlementIds, AGGREGATED_BALANCE_FIELD]
			: customerEntitlementIds;
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

	if (!results) return { kind: "missing" };

	const featureBalances: FeatureBalanceResult[] = [];

	for (let i = 0; i < featureIds.length; i++) {
		const customerEntitlementIds =
			customerEntitlementIdsByFeatureId[featureIds[i]] ?? [];
		const allValues = results[i]?.[1] as (string | null)[] | null;
		if (!allValues) return { kind: "missing" };

		let aggregated: AggregatedFeatureBalance | undefined;
		let ceValues: (string | null)[];

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
			ceValues = allValues;
		} else {
			ceValues = allValues;
		}

		if (ceValues.length !== customerEntitlementIds.length)
			return { kind: "missing" };

		const balances: SubjectBalance[] = [];
		for (const entryJson of ceValues) {
			if (!entryJson) return { kind: "missing" };
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
				return { kind: "missing" };
			}
		}

		featureBalances.push({
			featureId: featureIds[i],
			balances,
			aggregated,
		});
	}

	return { kind: "ok", value: featureBalances };
};
