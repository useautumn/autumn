import { transformFeatureRateCardToV2_3 } from "../../../features/changes/V2.3_FeatureRateCardChange.js";
import type { ApiBalanceV1 } from "../apiBalanceV1.js";

export const transformBalanceRateCardToV2_3 = ({
	input,
}: {
	input: ApiBalanceV1;
}): ApiBalanceV1 => {
	if (!input.feature) return input;

	return {
		...input,
		feature: transformFeatureRateCardToV2_3({ input: input.feature }),
	};
};
