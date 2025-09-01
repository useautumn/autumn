import {
	type CreditSchemaItem,
	type CusEntResponse,
	CusEntResponseSchema,
	type CusEntResponseV2,
	type CusRollover,
	type Feature,
	FeatureType,
	type FullCustomerEntitlement,
} from "@autumn/shared";
import {
	getCusFeatureType,
	isCreditSystem,
} from "@/internal/features/featureUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import type { CusFeatureBalance } from "./getCusBalances.js";

export const sumValues = (
	entList: CusEntResponse[],
	key: keyof CusEntResponse,
) => {
	return entList.reduce((acc, curr) => {
		if (curr[key]) {
			return acc + Number(curr[key]);
		}

		return acc;
	}, 0);
};

export const getEarliestNextResetAt = (entList: CusEntResponse[]) => {
	const earliest = entList.reduce((acc, curr) => {
		if (curr.next_reset_at && curr.next_reset_at < acc) {
			return curr.next_reset_at;
		}

		return acc;
	}, Infinity);

	return earliest === Infinity ? null : earliest;
};

export const featuresToObject = ({
	features,
	entList,
}: {
	features: Feature[];
	entList: CusEntResponse[];
}) => {
	const featureObject: Record<string, CusEntResponseV2> = {};

	for (const entRes of entList) {
		const feature = features.find((f) => f.id === entRes.feature_id)!;
		const featureType = getCusFeatureType({ feature });

		const featureId = feature.id;
		const unlimited = entRes.unlimited;
		const relatedEnts = entList.filter((e) => e.feature_id === featureId);

		if (featureObject[featureId]) {
			continue;
		}

		const includedUsage = sumValues(relatedEnts, "included_usage");
		let usageLimit: number | undefined = sumValues(relatedEnts, "usage_limit");
		if (notNullish(usageLimit) && usageLimit === includedUsage) {
			usageLimit = undefined;
		}

		// console.log(`Feature ${featureId} list:`, relatedEnts);

		const hasRollovers = relatedEnts.some((e) => notNullish(e.rollovers));
		const rollovers = hasRollovers
			? (relatedEnts
					.flatMap((e) => e.rollovers)
					.filter(notNullish) as CusRollover[])
			: undefined;
		const cusFeature: CusEntResponseV2 = {
			id: featureId,
			name: feature.name,
			type: featureType,
			unlimited,
			balance: unlimited ? null : sumValues(relatedEnts, "balance"),
			usage: sumValues(relatedEnts, "usage"),
			included_usage: sumValues(relatedEnts, "included_usage"),
			usage_limit: usageLimit,

			next_reset_at: getEarliestNextResetAt(relatedEnts),
			interval: relatedEnts.length === 1 ? relatedEnts[0].interval : "multiple",
			interval_count:
				relatedEnts.length === 1 ? relatedEnts[0].interval_count : null,
			overage_allowed: relatedEnts.some((e) => e.overage_allowed),
			breakdown:
				!unlimited && relatedEnts.length > 1
					? relatedEnts.map((e) => ({
							interval: e.interval!,
							interval_count: e.interval_count,
							balance: e.balance,
							usage: e.usage,
							included_usage: e.included_usage,
							next_reset_at: e.next_reset_at,
						}))
					: undefined,
			credit_schema: isCreditSystem({ feature })
				? feature.config?.schema?.map((s: CreditSchemaItem) => ({
						feature_id: s.metered_feature_id,
						credit_amount: s.credit_amount,
					}))
				: undefined,

			rollovers,
		};

		featureObject[featureId] = cusFeature;
	}

	return featureObject;
};

export const balancesToFeatureResponse = ({
	cusEnts,
	balances,
}: {
	cusEnts: FullCustomerEntitlement[];
	balances: CusFeatureBalance[];
}) => {
	const features = cusEnts.map((cusEnt) => cusEnt.entitlement.feature);

	let entList: any = balances.map((b) => {
		const isBoolean =
			features.find((f: Feature) => f.id === b.feature_id)?.type ===
			FeatureType.Boolean;

		if (b.unlimited || isBoolean) {
			return b;
		}

		return CusEntResponseSchema.parse({
			...b,
			usage: b.used,
			included_usage: b.allowance,
			overage_allowed: b.overage_allowed,
		});
	});

	entList = featuresToObject({
		features,
		entList,
	});

	return entList;
};
