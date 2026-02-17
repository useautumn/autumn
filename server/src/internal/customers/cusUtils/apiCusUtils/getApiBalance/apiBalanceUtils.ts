import {
	type ApiBalanceBreakdownV1,
	type ApiBalanceV1,
	type ApiFeatureV1,
	cusEntsToPlanId,
	cusEntsToRollovers,
	type FullCusEntWithFullCusProduct,
} from "@autumn/shared";

export const getBooleanApiBalance = ({
	cusEnts,
	apiFeature,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	apiFeature?: ApiFeatureV1;
}): ApiBalanceV1 => {
	const feature = cusEnts[0].entitlement.feature;
	const planId = cusEntsToPlanId({ cusEnts });
	const id = cusEnts[0].id;

	return {
		object: "balance",

		feature: apiFeature,
		feature_id: feature.id,

		unlimited: false,

		granted: 0,
		remaining: 0,
		usage: 0,

		overage_allowed: false,
		max_purchase: null,
		next_reset_at: null,

		breakdown: [
			{
				object: "balance_breakdown",
				id,
				plan_id: planId,
				included_grant: 0,
				prepaid_grant: 0,
				remaining: 0,
				usage: 0,
				unlimited: false,
				reset: null,
				expires_at: null,
				price: null,
				overage: 0,
			} satisfies ApiBalanceBreakdownV1,
		],
		rollovers: undefined,
	} satisfies ApiBalanceV1;
};

export const getUnlimitedApiBalance = ({
	apiFeature,
	cusEnts,
}: {
	apiFeature?: ApiFeatureV1;
	cusEnts: FullCusEntWithFullCusProduct[];
}): ApiBalanceV1 => {
	const feature = cusEnts[0].entitlement.feature;
	const planId = cusEntsToPlanId({ cusEnts });
	const id = cusEnts[0].id;
	const entityId = undefined; // Unlimited features don't have entity context

	return {
		object: "balance",
		feature: apiFeature,
		feature_id: feature.id,

		unlimited: true,

		granted: 0,
		remaining: 0,
		usage: 0,

		next_reset_at: null,
		max_purchase: null,
		overage_allowed: false,

		breakdown: [
			{
				object: "balance_breakdown",
				id,
				plan_id: planId,
				included_grant: 0,
				prepaid_grant: 0,
				remaining: 0,
				usage: 0,
				unlimited: true,
				reset: null,
				expires_at: null,
				price: null,
				overage: 0,
			} satisfies ApiBalanceBreakdownV1,
		],
		rollovers: cusEntsToRollovers({ cusEnts, entityId }),
	};
};
