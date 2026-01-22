import {
	type ApiBalanceBreakdownV1,
	type ApiBalanceReset,
	type ApiBalanceRollover,
	type ApiBalanceV1,
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
}): ApiBalanceV1 => {
	const feature = cusEnts[0].entitlement.feature;
	const planId = cusEntsToPlanId({ cusEnts });
	const id = cusEnts[0].id;

	return {
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

	return {
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
			} satisfies ApiBalanceBreakdownV1,
		] satisfies ApiBalanceBreakdownV1[],
		rollovers: undefined,
	};
};
