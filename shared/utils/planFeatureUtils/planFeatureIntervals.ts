import { EntInterval } from "@models/productModels/intervals/entitlementInterval.js";
import { ProductItemInterval } from "@models/productModels/intervals/productItemInterval.js";
import { ResetInterval } from "@models/productModels/intervals/resetInterval.js";

export const resetIntvToItemIntv = (
	resetIntv: ResetInterval,
): ProductItemInterval | null => {
	switch (resetIntv) {
		case ResetInterval.OneOff:
			return null;
		case ResetInterval.Minute:
			return ProductItemInterval.Minute;
		case ResetInterval.Hour:
			return ProductItemInterval.Hour;
		case ResetInterval.Day:
			return ProductItemInterval.Day;
		case ResetInterval.Week:
			return ProductItemInterval.Week;
		case ResetInterval.Month:
			return ProductItemInterval.Month;
		case ResetInterval.Quarter:
			return ProductItemInterval.Quarter;
		case ResetInterval.SemiAnnual:
			return ProductItemInterval.SemiAnnual;
		case ResetInterval.Year:
			return ProductItemInterval.Year;
		default:
			return null;
	}
};

/**
 * Convert ProductItemInterval back to ResetInterval
 */
export const itemIntvToResetIntv = (
	itemIntv: ProductItemInterval | null,
): ResetInterval => {
	switch (itemIntv) {
		case ProductItemInterval.Minute:
			return ResetInterval.Minute;
		case ProductItemInterval.Hour:
			return ResetInterval.Hour;
		case ProductItemInterval.Day:
			return ResetInterval.Day;
		case ProductItemInterval.Week:
			return ResetInterval.Week;
		case ProductItemInterval.Month:
			return ResetInterval.Month;
		case ProductItemInterval.Quarter:
			return ResetInterval.Quarter;
		case ProductItemInterval.SemiAnnual:
			return ResetInterval.SemiAnnual;
		case ProductItemInterval.Year:
			return ResetInterval.Year;
		default:
			return ResetInterval.OneOff;
	}
};

export const entIntvToResetIntv = ({
	entInterval,
}: {
	entInterval: EntInterval | null | undefined;
}) => {
	if (entInterval === EntInterval.Lifetime || !entInterval) {
		return ResetInterval.OneOff;
	}

	return entInterval as unknown as ResetInterval;
};

export const resetIntvToEntIntv = ({
	resetIntv,
}: {
	resetIntv: ResetInterval;
}) => {
	if (resetIntv === ResetInterval.OneOff) {
		return EntInterval.Lifetime;
	}

	return resetIntv as unknown as EntInterval;
};

export const toIntervalCountResponse = ({
	intervalCount,
}: {
	intervalCount: number | undefined;
}) => {
	if (intervalCount === 1) {
		return undefined;
	}
	return intervalCount;
};
