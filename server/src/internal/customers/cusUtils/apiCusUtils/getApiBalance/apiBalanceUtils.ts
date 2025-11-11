import {
	type ApiBalance,
	type ApiBalanceReset,
	type ApiBalanceRollover,
	type ApiFeature,
	cusEntToKey,
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
}): ApiBalanceReset | undefined => {
	// 1. If feature is allocated, undefined
	if (isContUseFeature({ feature })) return undefined;

	const cusEntKeys = cusEnts.map((cusEnt) => cusEntToKey({ cusEnt }));
	const uniqueCusEntKeys = [...new Set(cusEntKeys)];

	// 2. If > 1 cus ent key, return multiple
	if (uniqueCusEntKeys.length > 1) {
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
	apiFeature?: ApiFeature;
}): ApiBalance => {
	const feature = cusEnts[0].entitlement.feature;
	return {
		feature: apiFeature,
		feature_id: feature.id,

		unlimited: false,

		granted_balance: 0,
		purchased_balance: 0,
		current_balance: 0,
		usage: 0,

		max_purchase: 0,
		overage_allowed: false,

		reset: undefined,
		breakdown: undefined,
		rollovers: undefined,
	} satisfies ApiBalance;
};

export const getUnlimitedApiBalance = ({
	apiFeature,
	cusEnts,
}: {
	apiFeature?: ApiFeature;
	cusEnts: FullCusEntWithFullCusProduct[];
}): ApiBalance => {
	const feature = cusEnts[0].entitlement.feature;

	return {
		feature: apiFeature,
		feature_id: feature.id,

		unlimited: true,

		granted_balance: 0,
		purchased_balance: 0,
		current_balance: 0,
		usage: 0,

		max_purchase: 0,
		overage_allowed: false,

		reset: undefined,
		breakdown: undefined,
		rollovers: undefined,
	};
};

export const getNoCusEntsApiBalance = ({
	apiFeature,
	featureId,
}: {
	apiFeature?: ApiFeature;
	featureId: string;
}): ApiBalance => {
	return {
		feature: apiFeature,
		feature_id: featureId,
		unlimited: false,

		granted_balance: 0,
		purchased_balance: 0,
		current_balance: 0,
		usage: 0,

		max_purchase: 0,
		overage_allowed: false,

		reset: undefined,
		breakdown: undefined,
		rollovers: undefined,
	};
};
