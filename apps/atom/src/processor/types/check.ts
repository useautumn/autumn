import type { CheckCommand } from "@autumn/balance-engine";

/** A check as the customer's app asks it, validated where it entered. */
export type CheckRequest = {
	requestId: string;
	customerId: string;
	featureId: string;
	requiredBalance: number;
	properties: CheckCommand["properties"];
	occurredAt: number;
};

/** Why Atom hands a check back: the Autumn API answers it instead. */
export type AskApiReason = "subject_not_stored" | "feature_not_stored";

export type CheckReply = { allowed: boolean } | { askApi: AskApiReason };
