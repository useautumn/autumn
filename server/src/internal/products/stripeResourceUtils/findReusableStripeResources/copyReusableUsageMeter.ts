import {
	isConsumablePrice,
	type Price,
	type UsagePriceConfig,
} from "@autumn/shared";

const copyIfEmpty = ({
	target,
	source,
	field,
}: {
	target: UsagePriceConfig;
	source: UsagePriceConfig;
	field: "stripe_meter_id" | "stripe_event_name";
}): boolean => {
	if (target[field]) return false;
	if (!source[field]) return false;
	target[field] = source[field];
	return true;
};

/** Meter lives on Autumn config, not the Stripe Price retrieve. */
export const copyReusableUsageMeter = ({
	targetPrice,
	sourcePrice,
}: {
	targetPrice: Price;
	sourcePrice: Price;
}): boolean => {
	if (!isConsumablePrice(targetPrice) || !isConsumablePrice(sourcePrice)) {
		return false;
	}

	const copiedMeter = copyIfEmpty({
		target: targetPrice.config,
		source: sourcePrice.config,
		field: "stripe_meter_id",
	});
	const copiedEventName = copyIfEmpty({
		target: targetPrice.config,
		source: sourcePrice.config,
		field: "stripe_event_name",
	});
	return copiedMeter || copiedEventName;
};
