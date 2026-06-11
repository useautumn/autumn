import type { FullCusEntWithFullCusProduct } from "@autumn/shared";
import type { MutationLogItem } from "../types/mutationLogItem.js";

/**
 * Attribute a track event to an unlimited plan even though we skip the actual
 * deduction. Without this, resolveInternalProductIdForEvent gets an empty
 * mutation log and the event lands in "No plan". Returns null when there is no
 * unlimited entitlement to attribute to, or the resolved delta is zero.
 */
export const buildUnlimitedPlanMutationLog = ({
	unlimitedCusEnt,
	toDeduct,
	fallbackDeduction,
	entityId,
}: {
	unlimitedCusEnt: FullCusEntWithFullCusProduct | undefined;
	toDeduct: number | null | undefined;
	fallbackDeduction: number | null | undefined;
	entityId?: string | null;
}): MutationLogItem | null => {
	if (!unlimitedCusEnt) return null;

	const syntheticDelta = -(toDeduct ?? fallbackDeduction ?? 1);
	if (syntheticDelta === 0) return null;

	return {
		target_type: "customer_entitlement",
		customer_entitlement_id: unlimitedCusEnt.id,
		rollover_id: null,
		entity_id: entityId ?? null,
		credit_cost: 1,
		balance_delta: syntheticDelta,
		adjustment_delta: 0,
		usage_delta: 0,
		value_delta: 0,
	};
};
