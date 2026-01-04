import {
	type ApiBalance,
	type ApiFeatureV1,
	cusEntsToPlanId,
	type FullCusEntWithFullCusProduct,
} from "@autumn/shared";

export const getBooleanApiBalance = ({
	cusEnts,
	apiFeature,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	apiFeature?: ApiFeatureV1;
}): ApiBalance => {
	const feature = cusEnts[0].entitlement.feature;
	const planId = cusEntsToPlanId({ cusEnts });
	const id = cusEnts[0].id;

	return {
		feature: apiFeature,
		feature_id: feature.id,

		unlimited: false,

		granted_balance: 0,
		purchased_balance: 0,
		current_balance: 0,
		usage: 0,

		overage_allowed: false,
		max_purchase: null,
		reset: null,

		plan_id: planId,
		breakdown: [
			{
				id,
				plan_id: planId,
				granted_balance: 0,
				purchased_balance: 0,
				current_balance: 0,
				usage: 0,
				overage_allowed: false,
				max_purchase: null,
				reset: null,
				prepaid_quantity: 0,
			},
		],
		rollovers: undefined,
	} satisfies ApiBalance;
};

export const getUnlimitedApiBalance = ({
	apiFeature,
	cusEnts,
}: {
	apiFeature?: ApiFeatureV1;
	cusEnts: FullCusEntWithFullCusProduct[];
}): ApiBalance => {
	const feature = cusEnts[0].entitlement.feature;
	const planId = cusEntsToPlanId({ cusEnts });
	const id = cusEnts[0].id;

	return {
		feature: apiFeature,
		feature_id: feature.id,

		unlimited: true,

		granted_balance: 0,
		purchased_balance: 0,
		current_balance: 0,
		usage: 0,

		reset: null,
		max_purchase: null,
		overage_allowed: false,

		plan_id: planId,
		breakdown: [
			{
				id,
				plan_id: planId,
				granted_balance: 0,
				purchased_balance: 0,
				current_balance: 0,
				usage: 0,
				overage_allowed: false,
				max_purchase: null,
				reset: null,
				prepaid_quantity: 0,
			},
		],
		rollovers: undefined,
	};
};
