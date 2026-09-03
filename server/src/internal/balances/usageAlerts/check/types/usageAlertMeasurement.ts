import type {
	BalanceBasis,
	BalancesUsageAlertBalanceBlock,
	UsageLimitWebhookBlock,
} from "@autumn/shared";

export type UsageAlertPayloadBlock =
	| { basis: BalanceBasis; balance: BalancesUsageAlertBalanceBlock }
	| { basis: "usage_limit"; usage_limit: UsageLimitWebhookBlock };

export type UsageAlertMeasurement = {
	usage: number;
	denominator: number | null;
	remaining: number;
	periodStartAt: number | null;
	payloadBlock: UsageAlertPayloadBlock;
};
