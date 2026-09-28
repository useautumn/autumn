const INTERVAL_ABBREVIATIONS = {
	day: "day",
	week: "wk",
	month: "mo",
	quarter: "qtr",
	year: "yr",
} as const;

type AbbreviatedInterval = keyof typeof INTERVAL_ABBREVIATIONS;

export const isAbbreviatedInterval = (
	interval: string,
): interval is AbbreviatedInterval =>
	Object.keys(INTERVAL_ABBREVIATIONS).includes(interval);

/** "/mo", "/yr", or "/3 mo" for a price billed every few intervals. */
export const intervalSuffix = ({
	interval,
	intervalCount = 1,
}: {
	interval: AbbreviatedInterval;
	intervalCount?: number;
}) => {
	const unit = INTERVAL_ABBREVIATIONS[interval];
	return intervalCount > 1 ? `/${intervalCount} ${unit}` : `/${unit}`;
};
