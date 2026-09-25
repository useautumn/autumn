import type { ReviewChangeValue } from "./types/reviewChange";

/** "$50/mo" → amount "$50", suffix "/mo" so the unit can render dimmer. */
export const splitPriceLabel = (label: string): ReviewChangeValue => {
	const slashIndex = label.indexOf("/");
	if (slashIndex <= 0) return { amount: label };

	return {
		amount: label.slice(0, slashIndex),
		suffix: label.slice(slashIndex),
	};
};
