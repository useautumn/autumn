export type OverageBillingOption = "skipped" | "billed";

export const OVERAGE_BILLING_OPTIONS: {
	value: OverageBillingOption;
	label: string;
}[] = [
	{ value: "billed", label: "Billed" },
	{ value: "skipped", label: "Skipped" },
];

export const skipOverageBillingToOption = (
	skipOverageBilling?: boolean,
): OverageBillingOption => (skipOverageBilling ? "skipped" : "billed");

export const optionToSkipOverageBilling = (
	option: OverageBillingOption,
): boolean => option === "skipped";

export const skipOverageBillingLabel = (
	skipOverageBilling?: boolean,
): string | null => {
	if (skipOverageBilling === undefined) return null;
	return skipOverageBilling ? "Skipped" : "Billed";
};
