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

/** A credit system the cascade spills into, priced in its own cost domain. */
export type SpilloverDeduction = {
	feature: Feature;
	tokens: TokenDeduction;
};

export type FeatureDeduction = {
	feature: Feature;
	/**
	 * Number of priced events/units to deduct. The actual credit balance
	 * change is `deduction * credit_cost`, where credit_cost is resolved
	 * per-entitlement by `computeCreditCosts`. For standard features
	 * credit_cost is 1 so deduction equals the credit amount; for token
	 * features credit_cost is the USD cost so deduction is the event count.
	 */
	deduction: number;
	targetBalance?: number;
	/** Present only for track_tokens deductions; standard deductions omit it. */
	tokens?: TokenDeduction;
	lock?: LockParams;
	lockReceipt?: LockReceipt;
	lockReceiptKey?: string;
	unwindValue?: number;
	/**
	 * AI-credit cascade: extra credit systems whose balances absorb this
	 * deduction after `feature`'s own, each in its own cost domain. Their
	 * entitlements join the same atomic engine deduction, so the engine drains
	 * `feature` first (capped, since it disallows overage) and the leftover
	 * spills into these — settling the whole cascade in one call.
	 */
	spillover?: SpilloverDeduction[];
};

/** One AI credit system priced for a single token-track event. */
export type TokenCascadeSystem = {
	feature: Feature;
	cost: number;
};

/**
 * Builds the single atomic deduction for a token track from the ordered set of
 * AI credit systems to settle (primary first). Extra systems ride along as
 * spillover so the engine drains them in one pass; a lone system yields a plain
 * token deduction with no spillover.
 */
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

/**
 * A token track is a cascade when its deduction spills into extra credit
 * systems. Derived from the built deduction so "is this a cascade?" has one
 * source of truth across the request and queued-replay paths.
 */
export const isTokenCascade = (
	featureDeductions: FeatureDeduction[],
): boolean => (featureDeductions[0]?.spillover?.length ?? 0) > 0;

/**
 * Flattens a cascade deduction into one entry per feature. The engine settles a
 * cascade as a single multi-feature deduction, but response/property helpers
 * report per-feature, so they expand it back out first.
 */
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

/**
 * Resolves the customer-entitlement features a deduction should be settled
 * against: just `feature` when targeting a specific balance, otherwise
 * `feature` and its cascade spillover features each expanded to their
 * relevant credit-system family, deduped by feature id.
 */
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

	// Dedupe by feature id (same id resolves to the same feature).
	return [
		...new Map(
			relevantFeatures.map((relevantFeature) => [
				relevantFeature.id,
				relevantFeature,
			]),
		).values(),
	];
};
