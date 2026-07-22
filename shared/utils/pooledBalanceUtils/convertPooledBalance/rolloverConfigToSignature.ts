import { RolloverExpiryDurationType } from "../../../models/productModels/durationTypes/rolloverExpiryDurationType.js";
import type { RolloverConfig } from "../../../models/productV2Models/productItemModels/productItemModels.js";

const numberToSignaturePart = (value: number | null | undefined) =>
	value === null || value === undefined ? "null" : String(value);

export const rolloverConfigToSignature = ({
	rollover,
}: {
	rollover?: RolloverConfig | null;
}): string => {
	if (rollover === null || rollover === undefined) return "none";

	return [
		`max=${numberToSignaturePart(rollover.max)}`,
		`max_percentage=${numberToSignaturePart(rollover.max_percentage)}`,
		`duration=${rollover.duration ?? RolloverExpiryDurationType.Month}`,
		`length=${numberToSignaturePart(rollover.length)}`,
	].join(";");
};
