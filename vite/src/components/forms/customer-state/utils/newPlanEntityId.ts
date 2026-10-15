import type { CustomerStatePlan } from "@/components/forms/customer-state/customerStateSchema";

/** An entity picked in this editor wins; otherwise a new plan stays in the scope of the plans it follows. */
export const newPlanEntityId = ({
	lastSelectedEntityId,
	phasePlans,
}: {
	lastSelectedEntityId: string | null | undefined;
	phasePlans: CustomerStatePlan[];
}): string | null => {
	if (lastSelectedEntityId !== undefined) return lastSelectedEntityId;
	return phasePlans.filter((plan) => plan.productId).at(-1)?.entityId ?? null;
};
