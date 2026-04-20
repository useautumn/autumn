import type { AggregatedFeatureBalance, SubjectBalance } from "@autumn/shared";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import { tryRedisRead } from "@/utils/cacheUtils/cacheUtils.js";
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

const readFeatureBalancesFromMaster = async ({
	balanceKey,
	customerEntitlementIds,
}: {
	balanceKey: string;
	customerEntitlementIds: string[];
}): Promise<(string | null)[] | null> => {
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
	orgId,
	env,
	customerId,
	featureId,
	customerEntitlementIds,
	readMaster = false,
}: {
	orgId: string;
	env: string;
	customerId: string;
	featureId: string;
	customerEntitlementIds: string[];
	readMaster?: boolean;
}): Promise<FeatureBalanceResult | undefined> => {
	const balanceKey = buildSharedFullSubjectBalanceKey({
		orgId,
		env,
		customerId,
		featureId,
	});

	if (customerEntitlementIds.length === 0) {
		return { featureId, balances: [] };
	}

	const results = readMaster
		? await tryRedisRead(
				() =>
					readFeatureBalancesFromMaster({
						balanceKey,
						customerEntitlementIds,
					}),
				redisV2,
			)
		: await tryRedisRead(
				() => redisV2.hmget(balanceKey, ...customerEntitlementIds),
				redisV2,
			);
	if (!results) return undefined;

	const balances: SubjectBalance[] = [];
	for (let i = 0; i < customerEntitlementIds.length; i++) {
		const entryJson = results[i];
		if (!entryJson) return undefined;
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
			return undefined;
		}
	}

	return { featureId, balances };
};

export const getCachedFeatureBalancesBatch = async ({
	orgId,
	env,
	customerId,
	featureIds,
	customerEntitlementIdsByFeatureId,
	includeAggregated = false,
}: {
	orgId: string;
	env: string;
	customerId: string;
	featureIds: string[];
	customerEntitlementIdsByFeatureId: Record<string, string[]>;
	includeAggregated?: boolean;
}): Promise<FeatureBalanceResult[] | undefined> => {
	if (featureIds.length === 0) return [];

	const pipeline = redisV2.pipeline();
	for (const featureId of featureIds) {
		const customerEntitlementIds =
			customerEntitlementIdsByFeatureId[featureId] ?? [];
		const fields = includeAggregated
			? [...customerEntitlementIds, AGGREGATED_BALANCE_FIELD]
			: customerEntitlementIds;
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

	const results = await tryRedisRead(() => pipeline.exec(), redisV2);
	if (!results) return undefined;

	const featureBalances: FeatureBalanceResult[] = [];

	for (let i = 0; i < featureIds.length; i++) {
		const customerEntitlementIds =
			customerEntitlementIdsByFeatureId[featureIds[i]] ?? [];
		const allValues = results[i]?.[1] as (string | null)[] | null;
		if (!allValues) return undefined;

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

		if (ceValues.length !== customerEntitlementIds.length) return undefined;

		const balances: SubjectBalance[] = [];
		for (const entryJson of ceValues) {
			if (!entryJson) return undefined;
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
				return undefined;
			}
		}

		featureBalances.push({
			featureId: featureIds[i],
			balances,
			aggregated,
		});
	}

	return featureBalances;
};
