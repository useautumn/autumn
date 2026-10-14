import type { DeductionUpdate } from "../types/deductionUpdate";

export const deductionUpdatesToModifiedIds = ({
	updates,
}: {
	updates: Record<string, DeductionUpdate>;
}): string[] => {
	return Object.keys(updates);
};
