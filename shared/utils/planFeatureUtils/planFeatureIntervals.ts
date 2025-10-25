import { ResetInterval } from "@api/models.js";
import { EntInterval } from "@models/productModels/entModels/entEnums.js";
import {
	ProductItemInterval,
	RolloverDuration,
} from "@models/productV2Models/productItemModels/productItemModels.js";

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
	}
};

export const resetIntvToRollover = (
	resetIntv: ResetInterval,
): RolloverDuration => {
	switch (resetIntv) {
		case ResetInterval.Month:
			return RolloverDuration.Month;
		case null:
			return RolloverDuration.Forever;
		default:
			return RolloverDuration.Month;
	}
};

/**
 * Convert ProductItemInterval back to ResetInterval
 */
export const itemIntvToResetIntv = (
	itemIntv: ProductItemInterval,
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

/**
 * Convert RolloverDuration back to ResetInterval
 */
export const rolloverToResetIntv = (
	duration: RolloverDuration,
): ResetInterval => {
	switch (duration) {
		case RolloverDuration.Month:
			return ResetInterval.Month;
		case RolloverDuration.Forever:
			return ResetInterval.OneOff; // Forever maps to one-off/null
		default:
			return ResetInterval.Month;
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
