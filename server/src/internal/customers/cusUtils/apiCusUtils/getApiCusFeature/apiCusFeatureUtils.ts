import {
	type ApiCusFeature,
	type ApiCusRollover,
	type ApiFeature,
	cusEntToKey,
	entIntvToResetIntv,
	type FullCusEntWithFullCusProduct,
	getRolloverFields,
	notNullish,
	ResetInterval,
	toIntervalCountResponse,
} from "@autumn/shared";

export const cusEntsToInterval = ({
	cusEnts,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
}): {
	interval: ResetInterval | null;
	interval_count: number | undefined;
} => {
	const cusEntKeys = cusEnts.map((cusEnt) => cusEntToKey({ cusEnt }));
	const uniqueCusEntKeys = [...new Set(cusEntKeys)];
	if (uniqueCusEntKeys.length === 1) {
		return {
			interval: entIntvToResetIntv({
				entInterval: cusEnts[0].entitlement.interval,
			}),
			interval_count: toIntervalCountResponse({
				intervalCount: cusEnts[0].entitlement.interval_count,
			}),
		};
	}

	return { interval: null, interval_count: undefined };
};

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

export const cusEntsToRollovers = ({
	cusEnts,
	entityId,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	entityId?: string;
}): ApiCusRollover[] | undefined => {
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

export const getBooleanApiCusFeature = ({
	cusEnts,
	apiFeature,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	apiFeature?: ApiFeature;
}): ApiCusFeature => {
	const feature = cusEnts[0].entitlement.feature;
	return {
		feature: apiFeature,
		feature_id: feature.id,

		unlimited: false,

		granted_balance: 0,
		purchased_balance: 0,
		current_balance: 0,
		usage: 0,

		resets_at: null,
		reset: {
			interval: ResetInterval.OneOff,
			interval_count: undefined,
		},

		breakdown: undefined,
		rollovers: undefined,

		// Old
		// id: feature.id,
		// type: ApiFeatureType.Static,
		// name: feature.name,
		// balance: 0,
		// usage: 0,
		// included_usage: 0,
		// next_reset_at: null,
		// unlimited: false,
		// overage_allowed: false,
	} as ApiCusFeature;
};

export const getUnlimitedApiCusFeature = ({
	apiFeature,
	cusEnts,
}: {
	apiFeature?: ApiFeature;
	cusEnts: FullCusEntWithFullCusProduct[];
}): ApiCusFeature => {
	const feature = cusEnts[0].entitlement.feature;

	return {
		feature: apiFeature,
		feature_id: feature.id,

		unlimited: true,

		granted_balance: 0,
		purchased_balance: 0,
		current_balance: 0,
		usage: 0,

		resets_at: null,
		reset: {
			interval: ResetInterval.OneOff,
			interval_count: undefined,
		},

		breakdown: undefined,
		rollovers: undefined,
	};
};
