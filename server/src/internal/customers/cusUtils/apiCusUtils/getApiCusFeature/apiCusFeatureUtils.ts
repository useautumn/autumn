import {
	type ApiCusFeature,
	type ApiCusRollover,
	ApiFeatureType,
	cusEntToKey,
	type EntInterval,
	type FullCusEntWithFullCusProduct,
	getRolloverFields,
	notNullish,
} from "@autumn/shared";
import { getCusFeatureType } from "@/internal/features/featureUtils.js";

export const cusEntsToInterval = ({
	cusEnts,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
}): {
	interval: EntInterval | "multiple" | null;
	interval_count: number;
} => {
	const cusEntKeys = cusEnts.map((cusEnt) => cusEntToKey({ cusEnt }));
	const uniqueCusEntKeys = [...new Set(cusEntKeys)];
	if (uniqueCusEntKeys.length === 1) {
		return {
			interval: cusEnts[0].entitlement.interval || null,
			interval_count: cusEnts[0].entitlement.interval_count,
		};
	}

	return { interval: "multiple", interval_count: 0 };
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
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
}): ApiCusFeature => {
	const feature = cusEnts[0].entitlement.feature;
	return {
		id: feature.id,
		type: ApiFeatureType.Static,
		name: feature.name,
		balance: 0,
		usage: 0,
		included_usage: 0,
		next_reset_at: null,
		unlimited: false,
		overage_allowed: false,
	};
};

export const getUnlimitedApiCusFeature = ({
	cusEnts,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
}): ApiCusFeature => {
	const feature = cusEnts[0].entitlement.feature;

	return {
		id: feature.id,
		type: getCusFeatureType({ feature }),
		name: feature.name,
		balance: 0,
		usage: 0,
		included_usage: 0,
		next_reset_at: null,
		unlimited: true,
		overage_allowed: false,
	};
};
