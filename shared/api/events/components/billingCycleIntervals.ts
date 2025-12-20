export const BILLING_CYCLE_INTERVALS = ["1bc", "3bc", "last_cycle"] as const;

export type BillingCycleIntervalEnum = (typeof BILLING_CYCLE_INTERVALS)[number];
