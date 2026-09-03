import type {
	BalancesUsageAlertBalanceBlock,
	UsageLimitWebhookBlock,
} from "@autumn/shared";
import type { BalanceBasis } from "./balanceBasis.js";

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
