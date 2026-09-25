const INTERVAL_SUFFIXES: [RegExp, string][] = [
	[/ per month$/, "/mo"],
	[/ per year$/, "/yr"],
	[/ per quarter$/, "/qtr"],
	[/ per week$/, "/wk"],
	[/ per day$/, "/day"],
];

/** "$20 per month" → "$20/mo" so prices fit the review's value column. */
export const compactPriceLabel = (label: string) =>
	INTERVAL_SUFFIXES.reduce(
		(compact, [pattern, suffix]) => compact.replace(pattern, suffix),
		label,
	);
