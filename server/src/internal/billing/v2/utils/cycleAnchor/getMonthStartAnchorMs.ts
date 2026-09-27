import {
	type FullProduct,
	getNextMonthStartMs,
	isMonthStartMs,
	isOneOffProduct,
	isProductAnchoredToMonthStart,
} from "@autumn/shared";

/**
 * The 1st a month-start plan anchors to when it starts at `startsAt`.
 * None if it isn't flagged, already starts on a 1st, or a trial end anchors it instead.
 */
export const getMonthStartAnchorMs = ({
	fullProducts,
	startsAt,
	trialEndsAt,
}: {
	fullProducts: FullProduct[];
	startsAt: number;
	trialEndsAt?: number | null;
}): number | undefined => {
	const recurringProducts = fullProducts.filter(
		(product) => !isOneOffProduct({ product }),
	);
	const everyRecurringProductAnchored =
		recurringProducts.length > 0 &&
		recurringProducts.every((product) =>
			isProductAnchoredToMonthStart({ product }),
		);

	if (!everyRecurringProductAnchored) return undefined;
	if (trialEndsAt) return undefined;
	if (isMonthStartMs({ epochMs: startsAt })) return undefined;

	return getNextMonthStartMs({ epochMs: startsAt });
};
