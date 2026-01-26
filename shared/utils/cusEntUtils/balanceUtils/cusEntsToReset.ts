import type { ApiBalanceReset } from "../../../api/customers/cusFeatures/apiBalance";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { isContUseFeature } from "../../featureUtils/convertFeatureUtils";
import {
	entIntvToResetIntv,
	toIntervalCountResponse,
} from "../../planFeatureUtils/planFeatureIntervals";

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
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
}): ApiBalanceReset | null => {
	const feature = cusEnts[0].entitlement.feature;
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
