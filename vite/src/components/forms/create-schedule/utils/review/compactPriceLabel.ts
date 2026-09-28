import {
	intervalSuffix,
	isAbbreviatedInterval,
} from "@/utils/formatUtils/intervalSuffix";

const INTERVAL_PHRASE = / per (?:(?<count>\d+) )?(?<interval>[a-z]+?)s?$/;

/** "$20 per month" → "$20/mo" so prices fit the review's value column. */
export const compactPriceLabel = (label: string) => {
	const match = INTERVAL_PHRASE.exec(label);
	const interval = match?.groups?.interval;
	if (!match || !interval || !isAbbreviatedInterval(interval)) return label;

	const count = match.groups?.count;
	const suffix = intervalSuffix({
		interval,
		intervalCount: count ? Number(count) : 1,
	});
	return `${label.slice(0, match.index)}${suffix}`;
};
