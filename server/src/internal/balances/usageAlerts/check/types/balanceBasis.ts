import type { UsageAlertBasis } from "@autumn/shared";

export type BalanceBasis = Exclude<UsageAlertBasis, "usage_limit">;
