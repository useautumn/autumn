import {
	type AggregatedSubjectFlag,
	type ApiBalanceV1,
	type ApiFlagV0,
	type Feature,
	FeatureType,
	findFeatureByInternalId,
	type FullAggregatedFeatureBalance,
	type FullCusEntWithFullCusProduct,
	type FullSubject,
	fullSubjectToCustomerEntitlements,
	orgToInStatuses,
	scopeExpandForCtx,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiBalanceV2 } from "./getApiBalanceV2.js";
import { getApiFlagV2 } from "./getApiFlag.js";

type FeatureInput = {
	featureId: string;
	feature: Feature;
	customerEntitlements: FullCusEntWithFullCusProduct[];
	aggregatedFeatureBalance?: FullAggregatedFeatureBalance;
	aggregatedSubjectFlag?: AggregatedSubjectFlag;
};

const getFeatureInputs = ({
	customerEntitlements,
	fullSubject,
	features,
}: {
	customerEntitlements: FullCusEntWithFullCusProduct[];
	fullSubject: FullSubject;
	features: Feature[];
}): FeatureInput[] => {
	const customerEntitlementsByFeatureId: Record<
		string,
		FullCusEntWithFullCusProduct[]
	> = {};

	for (const customerEntitlement of customerEntitlements) {
		const featureId = customerEntitlement.entitlement.feature.id;
		customerEntitlementsByFeatureId[featureId] = [
			...(customerEntitlementsByFeatureId[featureId] ?? []),
			customerEntitlement,
		];
	}

	const aggregatedFeatureBalanceByFeatureId: Record<
		string,
		FullAggregatedFeatureBalance
	> = {};
	const aggregatedSubjectFlagByFeatureId: Record<string, AggregatedSubjectFlag> =
		{};

	if (fullSubject.subjectType === "customer") {
		for (const aggregatedFeatureBalance of fullSubject.aggregated_customer_entitlements ??
			[]) {
			aggregatedFeatureBalanceByFeatureId[aggregatedFeatureBalance.feature_id] =
				aggregatedFeatureBalance;
		}
		for (const [featureId, aggregatedSubjectFlag] of Object.entries(
			fullSubject.aggregated_subject_flags ?? {},
		)) {
			aggregatedSubjectFlagByFeatureId[featureId] = aggregatedSubjectFlag;
		}
	}

	const featureIds = new Set([
		...Object.keys(customerEntitlementsByFeatureId),
		...Object.keys(aggregatedFeatureBalanceByFeatureId),
		...Object.keys(aggregatedSubjectFlagByFeatureId),
	]);

	const featureInputs: FeatureInput[] = [];

	for (const featureId of featureIds) {
		const customerEntitlements =
			customerEntitlementsByFeatureId[featureId] ?? [];
		const aggregatedFeatureBalance =
			aggregatedFeatureBalanceByFeatureId[featureId];
		const aggregatedSubjectFlag = aggregatedSubjectFlagByFeatureId[featureId];
		const feature =
			customerEntitlements[0]?.entitlement.feature ??
			aggregatedFeatureBalance?.feature ??
			(aggregatedSubjectFlag
				? findFeatureByInternalId({
						features,
						internalId: aggregatedSubjectFlag.internal_feature_id,
					})
				: undefined);

		if (!feature) continue;

		featureInputs.push({
			featureId,
			feature,
			customerEntitlements,
			aggregatedFeatureBalance,
			aggregatedSubjectFlag,
		});
	}

	return featureInputs;
};

export const getApiBalancesV2 = ({
	ctx,
	fullSubject,
}: {
	ctx: RequestContext;
	fullSubject: FullSubject;
}): {
	balances: Record<string, ApiBalanceV1>;
	flags: Record<string, ApiFlagV0>;
} => {
	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
		inStatuses: orgToInStatuses({
			org: ctx.org,
		}),
	});
	const featureInputs = getFeatureInputs({
		customerEntitlements,
		fullSubject,
		features: ctx.features,
	});

	const apiBalances: Record<string, ApiBalanceV1> = {};
	const apiFlags: Record<string, ApiFlagV0> = {};

	const flagScopedCtx = scopeExpandForCtx({
		ctx,
		prefix: ["flags", "flag"],
	});
	const balancesScopedCtx = scopeExpandForCtx({
		ctx,
		prefix: ["balances", "balance"],
	});

	for (const featureInput of featureInputs) {
		const {
			featureId,
			feature,
			customerEntitlements,
			aggregatedFeatureBalance,
			aggregatedSubjectFlag,
		} = featureInput;

		if (feature.type === FeatureType.Boolean) {
			const apiFlag = getApiFlagV2({
				ctx: flagScopedCtx,
				customerEntitlements,
				feature,
				aggregatedSubjectFlag,
			});

			if (apiFlag) {
				apiFlags[featureId] = apiFlag;
			}

			continue;
		}

		const { data } = getApiBalanceV2({
			ctx: balancesScopedCtx,
			fullSubject,
			customerEntitlements,
			feature,
			aggregatedFeatureBalance,
		});

		apiBalances[featureId] = data;
	}

	return {
		balances: apiBalances,
		flags: apiFlags,
	};
};
