import type { SubjectBalance } from "@autumn/shared";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import { tryRedisRead } from "@/utils/cacheUtils/cacheUtils.js";
import { buildSharedFullSubjectBalanceKey } from "../builders/buildSharedFullSubjectBalanceKey.js";

export type FeatureBalanceResult = {
	featureId: string;
	balances: SubjectBalance[];
};

export const getCachedFeatureBalance = async ({
	orgId,
	env,
	customerId,
	featureId,
	customerEntitlementIds,
}: {
	orgId: string;
	env: string;
	customerId: string;
	featureId: string;
	customerEntitlementIds: string[];
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

	const results = await tryRedisRead(
		() => redisV2.hmget(balanceKey, ...customerEntitlementIds),
		redisV2,
	);
	if (!results) return undefined;

	const balances: SubjectBalance[] = [];
	for (let i = 0; i < customerEntitlementIds.length; i++) {
		const entryJson = results[i];
		if (!entryJson) return undefined;
		try {
			balances.push(JSON.parse(entryJson) as SubjectBalance);
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
}: {
	orgId: string;
	env: string;
	customerId: string;
	featureIds: string[];
	customerEntitlementIdsByFeatureId: Record<string, string[]>;
}): Promise<FeatureBalanceResult[] | undefined> => {
	if (featureIds.length === 0) return [];

	const pipeline = redisV2.pipeline();
	for (const featureId of featureIds) {
		const customerEntitlementIds =
			customerEntitlementIdsByFeatureId[featureId] ?? [];
		pipeline.hmget(
			buildSharedFullSubjectBalanceKey({
				orgId,
				env,
				customerId,
				featureId,
			}),
			...customerEntitlementIds,
		);
	}

	const results = await tryRedisRead(() => pipeline.exec(), redisV2);
	if (!results) return undefined;

	const featureBalances: FeatureBalanceResult[] = [];

	for (let i = 0; i < featureIds.length; i++) {
		const customerEntitlementIds =
			customerEntitlementIdsByFeatureId[featureIds[i]] ?? [];
		const values = results[i]?.[1] as (string | null)[] | null;
		if (!values || values.length !== customerEntitlementIds.length) {
			return undefined;
		}

		const balances: SubjectBalance[] = [];
		for (const entryJson of values) {
			if (!entryJson) return undefined;
			try {
				balances.push(JSON.parse(entryJson) as SubjectBalance);
			} catch {
				return undefined;
			}
		}

		featureBalances.push({
			featureId: featureIds[i],
			balances,
		});
	}

	return featureBalances;
};
