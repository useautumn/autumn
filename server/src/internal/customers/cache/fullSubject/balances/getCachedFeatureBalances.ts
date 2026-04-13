import type { SubjectBalance } from "@autumn/shared";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import { tryRedisRead } from "@/utils/cacheUtils/cacheUtils.js";
import { buildFullSubjectBalanceKey } from "../builders/buildFullSubjectBalanceKey.js";

type BalanceHashMeta = {
	featureId: string;
	customerEntitlementIds: string[];
};

export type FeatureBalanceResult = {
	featureId: string;
	balances: SubjectBalance[];
};

export const getCachedFeatureBalance = async ({
	orgId,
	env,
	customerId,
	entityId,
	featureId,
}: {
	orgId: string;
	env: string;
	customerId: string;
	entityId?: string;
	featureId: string;
}): Promise<FeatureBalanceResult | undefined> => {
	const balanceKey = buildFullSubjectBalanceKey({
		orgId,
		env,
		customerId,
		entityId,
		featureId,
	});

	const fields = await tryRedisRead(() => redisV2.hgetall(balanceKey), redisV2);
	if (!fields?._meta) return undefined;

	const meta = JSON.parse(fields._meta) as BalanceHashMeta;
	const balances: SubjectBalance[] = [];

	for (const customerEntitlementId of meta.customerEntitlementIds) {
		const entryJson = fields[customerEntitlementId];
		if (!entryJson) continue;
		balances.push(JSON.parse(entryJson) as SubjectBalance);
	}

	return { featureId, balances };
};

export const getCachedFeatureBalancesBatch = async ({
	orgId,
	env,
	customerId,
	entityId,
	featureIds,
}: {
	orgId: string;
	env: string;
	customerId: string;
	entityId?: string;
	featureIds: string[];
}): Promise<FeatureBalanceResult[]> => {
	if (featureIds.length === 0) return [];

	const pipeline = redisV2.pipeline();
	for (const featureId of featureIds) {
		pipeline.hgetall(
			buildFullSubjectBalanceKey({
				orgId,
				env,
				customerId,
				entityId,
				featureId,
			}),
		);
	}

	const results = await tryRedisRead(() => pipeline.exec(), redisV2);
	if (!results) return [];

	const featureBalances: FeatureBalanceResult[] = [];

	for (let i = 0; i < featureIds.length; i++) {
		const fields = results[i]?.[1] as Record<string, string> | null;
		if (!fields?._meta) continue;

		const meta = JSON.parse(fields._meta) as BalanceHashMeta;
		const balances: SubjectBalance[] = [];

		for (const customerEntitlementId of meta.customerEntitlementIds) {
			const entryJson = fields[customerEntitlementId];
			if (!entryJson) continue;
			balances.push(JSON.parse(entryJson) as SubjectBalance);
		}

		featureBalances.push({
			featureId: featureIds[i],
			balances,
		});
	}

	return featureBalances;
};
