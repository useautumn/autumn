import {
	type FullProduct,
	getNextMonthStartMs,
	isMonthStartMs,
	isOneOffProduct,
	isProductAnchoredToMonthStart,
} from "@autumn/shared";

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
