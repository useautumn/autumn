import type { DeductionUpdate } from "../../utils/types/deductionUpdate";

/**
 * Convert deduction updates to modified customer entitlement IDs.
 * @param updates - The deduction updates.
 * @returns The modified customer entitlement IDs.
 */
export const deductionUpdatesToModifiedIds = ({
	updates,
}: {
	updates: Record<string, DeductionUpdate>;
}): string[] => {
	return Object.keys(updates).filter((id) => updates[id].deducted > 0);
};
