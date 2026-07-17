import { Decimal } from "decimal.js";
import type { DeductionUpdate } from "../types/deductionUpdate.js";

const sumDeductionCounters = ({
	previousValue,
	currentValue,
}: {
	previousValue: number;
	currentValue: number;
}): number => new Decimal(previousValue).plus(currentValue).toNumber();

const mergeDeductionUpdate = ({
	previousUpdate,
	currentUpdate,
}: {
	previousUpdate: DeductionUpdate;
	currentUpdate: DeductionUpdate;
}): DeductionUpdate => {
	const mergedUpdate: DeductionUpdate = {
		...previousUpdate,
		...currentUpdate,
		deducted: sumDeductionCounters({
			previousValue: previousUpdate.deducted,
			currentValue: currentUpdate.deducted,
		}),
	};

	if (
		previousUpdate.additional_deducted !== undefined ||
		currentUpdate.additional_deducted !== undefined
	) {
		mergedUpdate.additional_deducted = sumDeductionCounters({
			previousValue: previousUpdate.additional_deducted ?? 0,
			currentValue: currentUpdate.additional_deducted ?? 0,
		});
	}

	return mergedUpdate;
};

/**
 * Combines per-feature deduction results into one operation result.
 *
 * Each result contains the entitlement's absolute post-deduction state, so the
 * latest state wins. Deduction counters are local to one result and therefore
 * accumulate when multiple features consume the same entitlement.
 */
export const mergeDeductionUpdates = ({
	accumulatedUpdates,
	currentUpdates,
}: {
	accumulatedUpdates: Record<string, DeductionUpdate>;
	currentUpdates: Record<string, DeductionUpdate>;
}): Record<string, DeductionUpdate> => {
	const mergedUpdates = { ...accumulatedUpdates };

	for (const [customerEntitlementId, currentUpdate] of Object.entries(
		currentUpdates,
	)) {
		const previousUpdate = accumulatedUpdates[customerEntitlementId];
		mergedUpdates[customerEntitlementId] = previousUpdate
			? mergeDeductionUpdate({ previousUpdate, currentUpdate })
			: currentUpdate;
	}

	return mergedUpdates;
};
