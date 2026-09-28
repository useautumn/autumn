import {
	parseAsArrayOf,
	parseAsBoolean,
	parseAsString,
	parseAsStringLiteral,
	useQueryStates,
} from "nuqs";

export const LOG_RANGES = ["24h", "7d", "30d", "90d"] as const;
export type LogRange = (typeof LOG_RANGES)[number];

export const LOG_RANGE_LABELS: Record<LogRange, string> = {
	"24h": "Last 24 hours",
	"7d": "Last 7 days",
	"30d": "Last 30 days",
	"90d": "Last 90 days",
};

/** events.list and events.aggregate reject more than this many `filter_by` keys. */
export const MAX_PROPERTY_FILTERS = 5;

const SURROUNDING_QUOTES = /^(["'])(.*)\1$/s;

export type PropertyFilter = { key: string; value: string };

/** URL-synced Logs filters. `customer_id` matches the Usage page's param. */
export const useLogsFilters = () => {
	const [filters, setFilters] = useQueryStates(
		{
			feature_id: parseAsString,
			customer_id: parseAsString,
			range: parseAsStringLiteral(LOG_RANGES).withDefault("24h"),
			/** `key=value` property matches, sent together as `filter_by`. */
			properties: parseAsArrayOf(parseAsString).withDefault([]),
			live: parseAsBoolean.withDefault(false),
		},
		{ history: "push" },
	);
	return { filters, setFilters };
};

/** Parses `key=value` (spaces allowed around `=`); null when either side is empty. */
export const parsePropertyFilter = ({
	raw,
}: {
	raw: string;
}): PropertyFilter | null => {
	const separator = raw.indexOf("=");
	if (separator <= 0) return null;
	const key = raw.slice(0, separator).trim();
	// Values are matched as plain text, so `"sonnet-5"` should match sonnet-5.
	const value = raw
		.slice(separator + 1)
		.trim()
		.replace(SURROUNDING_QUOTES, "$2");
	return key && value ? { key, value } : null;
};

export const formatPropertyFilter = ({ key, value }: PropertyFilter) =>
	`${key}=${value}`;

/** The URL's property filters as a `filter_by` record, later keys winning. */
export const toFilterBy = ({
	properties,
}: {
	properties: string[];
}): Record<string, string> | undefined => {
	const filterBy: Record<string, string> = {};
	for (const raw of properties.slice(0, MAX_PROPERTY_FILTERS)) {
		const parsed = parsePropertyFilter({ raw });
		if (parsed) filterBy[parsed.key] = parsed.value;
	}
	return Object.keys(filterBy).length > 0 ? filterBy : undefined;
};

/** Adds a filter, replacing any existing filter on the same key. */
export const withPropertyFilter = ({
	properties,
	filter,
}: {
	properties: string[];
	filter: PropertyFilter;
}): string[] => [
	...properties.filter(
		(raw) => parsePropertyFilter({ raw })?.key !== filter.key,
	),
	formatPropertyFilter(filter),
];
