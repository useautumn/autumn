import type { Feature, LockParams } from "@autumn/shared";
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
		return [
			{ ...deduction, spillover: undefined },
			...deduction.spillover.map((spill) => ({
				...deduction,
				feature: spill.feature,
				tokens: spill.tokens,
				spillover: undefined,
			})),
		];
	});
