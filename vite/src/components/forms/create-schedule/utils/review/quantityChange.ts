import type { ReviewChangeQuantity } from "./types/reviewChange";

/** Net change for a quantity that moved, or undefined when it didn't. */
export const quantityDelta = (quantity: ReviewChangeQuantity) => {
	const { current, previous } = quantity;
	if (previous === undefined || previous === current) return undefined;
	return current - previous;
};

export const formatQuantityDelta = (delta: number) =>
	delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;

export const isMovedQuantity = (
	quantity: ReviewChangeQuantity | undefined,
): quantity is Required<ReviewChangeQuantity> =>
	quantity !== undefined && quantityDelta(quantity) !== undefined;
