import type {
	BalancesUsageAlertBalanceBlock,
	UsageAlertBasis,
	UsageLimitWebhookBlock,
} from "@autumn/shared";

export type UsageAlertPayloadBlock =
	| {
			basis: Exclude<UsageAlertBasis, "usage_limit">;
			balance: BalancesUsageAlertBalanceBlock;
	  }
	| { basis: "usage_limit"; usage_limit: UsageLimitWebhookBlock };

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
