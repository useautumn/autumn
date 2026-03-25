import type { Feature, LockParams } from "@autumn/shared";
import type { LockReceipt } from "../lock/fetchLockReceipt.js";
export type FeatureDeduction = {
	feature: Feature;
	deduction: number;
	targetBalance?: number;

	tokenUsage?: {
		modelName: string;
		inputTokens: number;
		outputTokens: number;
	};

	lock?: LockParams;
	lockReceipt?: LockReceipt;
	lockReceiptKey?: string;
	unwindValue?: number;
};
