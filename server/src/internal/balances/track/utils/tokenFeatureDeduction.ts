import type { Feature } from "@autumn/shared";
import type {
	FeatureDeduction,
	TokenDeduction,
} from "../../utils/types/featureDeduction.js";

/** A track_tokens deduction: one unit, priced at the token cost. */
export const toTokenFeatureDeduction = ({
	feature,
	tokens,
}: {
	feature: Feature;
	tokens: TokenDeduction;
}): FeatureDeduction => ({ feature, deduction: 1, tokens });

export const findTokenDeduction = ({
	featureDeductions,
}: {
	featureDeductions: FeatureDeduction[];
}): TokenDeduction | undefined =>
	featureDeductions.find((deduction) => deduction.tokens)?.tokens;
