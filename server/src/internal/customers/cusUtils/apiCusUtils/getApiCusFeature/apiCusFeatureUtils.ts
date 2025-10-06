import {
	type ApiCusFeature,
	ApiFeatureType,
	type FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import { getCusFeatureType } from "@/internal/features/featureUtils.js";

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
	unlimited,
	usageAllowed,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	unlimited: boolean;
	usageAllowed: boolean;
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
		unlimited,
		overage_allowed: usageAllowed,
	};
};
