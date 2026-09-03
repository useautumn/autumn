import type { UsageAlertBasis } from "@autumn/shared";

export const USAGE_ALERT_BASIS_LABELS: Record<UsageAlertBasis, string> = {
	balance: "Total balance",
	included: "Plan allowance",
	recurring: "Recurring grants",
	usage_limit: "Usage limit cap",
};

export const USAGE_ALERT_BASIS_DESCRIPTIONS: Record<UsageAlertBasis, string> = {
	balance: "Every grant on the feature, including top-ups and rollover.",
	included: "Only the allowance granted by plans.",
	recurring: "Only grants that reset each period.",
	usage_limit:
		"The cap of the usage limit with the same feature and conditions.",
};

export const BALANCE_BASIS_OPTIONS = (
	["balance", "included", "recurring"] as const
).map((basis) => ({ value: basis, label: USAGE_ALERT_BASIS_LABELS[basis] }));

export const ALL_BASIS_OPTIONS = (
	["balance", "included", "recurring", "usage_limit"] as const
).map((basis) => ({ value: basis, label: USAGE_ALERT_BASIS_LABELS[basis] }));
