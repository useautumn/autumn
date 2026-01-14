import {
	type ApiBalance,
	type ApiBalanceReset,
	type ApiBalanceRollover,
	type ApiFeatureV1,
	cusEntsToPlanId,
	entIntvToResetIntv,
	type Feature,
	type FullCusEntWithFullCusProduct,
	getRolloverFields,
	isContUseFeature,
	notNullish,
	toIntervalCountResponse,
} from "@autumn/shared";

export const cusEntsToNextResetAt = ({
	cusEnts,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
}) => {
	const result = cusEnts.reduce((acc, curr) => {
		if (curr.next_reset_at && curr.next_reset_at < acc) {
			return curr.next_reset_at;
		}
		return acc;
	}, Infinity);

	if (result === Infinity) return null;

	return result;
};

export const cusEntsToReset = ({
	cusEnts,
	feature,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	feature: Feature;
}): ApiBalanceReset | null => {
	// 1. If feature is allocated, null
	if (isContUseFeature({ feature })) return null;

	// Check if there are multiple intervals
	const uniqueIntervals = [
		...new Set(cusEnts.map((cusEnt) => cusEnt.entitlement.interval)),
	];

	if (uniqueIntervals.length > 1) {
		return { interval: "multiple", interval_count: undefined, resets_at: null };
	}

	// 3. Only 1 interval
	return {
		interval: entIntvToResetIntv({
			entInterval: cusEnts[0].entitlement.interval,
		}),

		interval_count: toIntervalCountResponse({
			intervalCount: cusEnts[0].entitlement.interval_count,
		}),

		resets_at: cusEntsToNextResetAt({ cusEnts }),
	};
};

export const cusEntsToRollovers = ({
	cusEnts,
	entityId,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	entityId?: string;
}): ApiBalanceRollover[] | undefined => {
	// If all cus ents no rollover, return undefined

	if (cusEnts.every((cusEnt) => !cusEnt.entitlement.rollover)) {
		return undefined;
	}

	return cusEnts
		.map((cusEnt) => {
			const rolloverFields = getRolloverFields({ cusEnt, entityId });
			if (rolloverFields)
				return rolloverFields.rollovers.map((rollover) => ({
					balance: rollover.balance,
					expires_at: rollover.expires_at || 0,
				}));
			return [];
		})
		.filter(notNullish)
		.flat();
};

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
				expires_at: null,
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
				expires_at: null,
			},
		],
		rollovers: undefined,
	};
};
