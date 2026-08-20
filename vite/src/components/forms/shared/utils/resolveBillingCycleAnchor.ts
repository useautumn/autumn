export type BillingCycleAnchorMode = "now" | "custom";

export const resolveBillingCycleAnchor = ({
	resetBillingCycle,
	billingCycleAnchorMode,
	billingCycleAnchorDate,
}: {
	resetBillingCycle: boolean;
	billingCycleAnchorMode: BillingCycleAnchorMode;
	billingCycleAnchorDate: number | null;
}): "now" | number | undefined => {
	if (!resetBillingCycle) return undefined;
	if (billingCycleAnchorMode === "now") return "now";
	return billingCycleAnchorDate ?? undefined;
};
