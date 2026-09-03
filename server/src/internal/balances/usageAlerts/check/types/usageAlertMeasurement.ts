import type {
	BalancesUsageAlertBalanceBlock,
	UsageLimitWebhookBlock,
} from "@autumn/shared";

export type UsageAlertPayloadBlock =
	| { balance: BalancesUsageAlertBalanceBlock }
	| { usage_limit: UsageLimitWebhookBlock };

export type UsageAlertMeasurement = {
	usage: number;
	denominator: number | null;
	remaining: number;
	periodStartAt: number | null;
	payloadBlock: UsageAlertPayloadBlock;
};

export type UsageAlertMeasurementPair = {
	before: UsageAlertMeasurement;
	after: UsageAlertMeasurement;
};
