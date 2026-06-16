import {
	type Feature,
	getRelevantFeatures,
	type LockParams,
	notNullish,
} from "@autumn/shared";
import type { LockReceipt } from "../lock/fetchLockReceipt.js";

export type TokenUsage = {
	modelName: string;
	inputTokens: number;
	outputTokens: number;
};

/** Token usage and its USD cost are priced together at the API layer — one cannot exist without the other. */
export type TokenDeduction = {
	usage: TokenUsage;
	cost: number;
};

export type SpilloverDeduction = {
	feature: Feature;
	tokens: TokenDeduction;
};

export type FeatureDeduction = {
	feature: Feature;
	deduction: number;
	targetBalance?: number;
	tokens?: TokenDeduction;
	lock?: LockParams;
	lockReceipt?: LockReceipt;
	lockReceiptKey?: string;
	unwindValue?: number;
	spillover?: SpilloverDeduction[];
};

export type TokenCascadeSystem = {
	feature: Feature;
	cost: number;
};

export const buildTokenCascadeDeduction = ({
	systems,
	tokenUsage,
}: {
	systems: TokenCascadeSystem[];
	tokenUsage: TokenUsage;
}): FeatureDeduction => {
	const [primary, ...rest] = systems;
	return {
		feature: primary.feature,
		deduction: 1,
		tokens: { usage: tokenUsage, cost: primary.cost },
		...(rest.length > 0 && {
			spillover: rest.map((system) => ({
				feature: system.feature,
				tokens: { usage: tokenUsage, cost: system.cost },
			})),
		}),
	};
};

export const isTokenCascade = (
	featureDeductions: FeatureDeduction[],
): boolean => (featureDeductions[0]?.spillover?.length ?? 0) > 0;

export const expandCascadeDeductions = (
	featureDeductions: FeatureDeduction[],
): FeatureDeduction[] =>
	featureDeductions.flatMap((deduction) => {
		if (!deduction.spillover || deduction.spillover.length === 0) {
			return [deduction];
		}
		const primaryOnly = { ...deduction, spillover: undefined };
		return [
			primaryOnly,
			...deduction.spillover.map((spilloverDeduction) => ({
				feature: spilloverDeduction.feature,
				deduction: deduction.deduction,
				tokens: spilloverDeduction.tokens,
			})),
		];
	});

export const getRelevantFeaturesForDeduction = ({
	features,
	deduction,
}: {
	features: Feature[];
	deduction: FeatureDeduction;
}): Feature[] => {
	const { feature, targetBalance, spillover } = deduction;
	if (notNullish(targetBalance)) return [feature];

	const spilloverFeatures =
		spillover?.map((spilloverDeduction) => spilloverDeduction.feature) ?? [];
	const relevantFeatures = [
		...getRelevantFeatures({ features, featureId: feature.id }),
		...spilloverFeatures.flatMap((spilloverFeature) =>
			getRelevantFeatures({ features, featureId: spilloverFeature.id }),
		),
	];

	return [
		...new Map(
			relevantFeatures.map((relevantFeature) => [
				relevantFeature.id,
				relevantFeature,
			]),
		).values(),
	];
};
