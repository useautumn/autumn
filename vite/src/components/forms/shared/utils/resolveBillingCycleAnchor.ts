export type BillingCycleAnchorMode = "now" | "custom" | "phase_start";

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
	if (billingCycleAnchorMode === "phase_start") return undefined;
	return billingCycleAnchorDate ?? undefined;
};
