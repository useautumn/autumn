import type { Feature } from "@autumn/shared";
import type {
	FeatureDeduction,
	TokenDeduction,
} from "../../utils/types/featureDeduction.js";

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
