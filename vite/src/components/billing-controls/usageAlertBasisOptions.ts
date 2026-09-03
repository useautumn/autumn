import {
	BALANCE_BASES,
	USAGE_ALERT_BASES,
	type UsageAlertBasis,
} from "@autumn/shared";

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
		"The cap of this feature's usage limit. With no conditions, that is the limit without conditions.",
};

export type UsageAlertBasisOption = { value: UsageAlertBasis; label: string };

const basisToOption = (basis: UsageAlertBasis): UsageAlertBasisOption => ({
	value: basis,
	label: USAGE_ALERT_BASIS_LABELS[basis],
});

export const USAGE_ALERT_BASIS_OPTIONS: readonly UsageAlertBasisOption[] =
	USAGE_ALERT_BASES.map(basisToOption);

export const ORG_USAGE_ALERT_BASIS_OPTIONS: readonly UsageAlertBasisOption[] =
	BALANCE_BASES.map(basisToOption);
