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
