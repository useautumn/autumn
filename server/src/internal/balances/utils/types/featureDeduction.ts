import type { Feature, LockParams } from "@autumn/shared";
import type { LockReceipt } from "../lock/fetchLockReceipt.js";
import type { MutationLogItem } from "./mutationLogItem.js";

export type CascadeRole = "included" | "overage";

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
	 * Token-cascade marker. "included" legs always run with overage behaviour
	 * "cap" and report their leftover; "overage" legs have their amount scaled
	 * by the included leg's remaining event fraction before executing.
	 */
	cascade?: { role: CascadeRole };
	/**
	 * Inline compensation: re-credit exactly these ordered mutation items in
	 * reverse, without a persisted lock receipt. Used together with unwindValue.
	 */
	unwindItems?: MutationLogItem[];
};
