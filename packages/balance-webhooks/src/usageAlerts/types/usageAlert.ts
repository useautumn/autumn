import type { WorkerFullSubject } from "@autumn/balance-engine";
import type {
	BalanceBasis,
	BalancesUsageAlertBalanceBlock,
	DbUsageAlert,
	UsageLimitWebhookBlock,
} from "@autumn/shared";

export type BeforeAfter<T> = { before: T; after: T };

/** The subject as the mutation found it and as it left it. */
export type TrackedSubjects = BeforeAfter<WorkerFullSubject>;

export type AlertScope = "customer" | "entity" | "org" | "plan";

export type ScopedUsageAlerts = {
	scope: AlertScope;
	alerts: DbUsageAlert[];
	entityId?: string;
};

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
