import type { Feature, LockParams } from "@autumn/shared";
import type { LockReceipt } from "../lock/fetchLockReceipt.js";

export type TokenUsage = {
	modelName: string;
	inputTokens: number;
	outputTokens: number;
};

export type TokenDeduction = {
	usage: TokenUsage;
	cost: number;
};

export type FeatureDeduction = {
	feature: Feature;
	deduction: number;
	enforceOverdueBlock?: boolean;
	targetBalance?: number;
	tokens?: TokenDeduction;
	lock?: LockParams;
	lockReceipt?: LockReceipt;
	lockReceiptKey?: string;
	unwindValue?: number;
};
