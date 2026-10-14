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

export const MAX_PROPERTY_FILTERS = 5;

const SURROUNDING_QUOTES = /^(["'])(.*)\1$/s;

export type PropertyFilter = { key: string; value: string };

export const useLogsFilters = () => {
	const [filters, setFilters] = useQueryStates(
		{
			feature_id: parseAsString,
			customer_id: parseAsString,
			range: parseAsStringLiteral(LOG_RANGES).withDefault("24h"),
			properties: parseAsArrayOf(parseAsString).withDefault([]),
			live: parseAsBoolean.withDefault(false),
		},
		{ history: "push" },
	);
	return {
		filters,
		setFilters,
		propertyFilters: toPropertyFilters({ properties: filters.properties }),
	};
};

export const parsePropertyFilter = ({
	raw,
}: {
	raw: string;
}): PropertyFilter | null => {
	const separator = raw.indexOf("=");
	if (separator <= 0) return null;
	const key = raw.slice(0, separator).trim();
	const value = raw
		.slice(separator + 1)
		.trim()
		.replace(SURROUNDING_QUOTES, "$2");
	return key && value ? { key, value } : null;
};

const formatPropertyFilter = ({ key, value }: PropertyFilter) =>
	`${key}=${value}`;

export const toPropertyFilters = ({
	properties,
}: {
	properties: string[];
}): PropertyFilter[] => {
	const byKey = new Map<string, PropertyFilter>();
	for (const raw of properties) {
		const parsed = parsePropertyFilter({ raw });
		if (!parsed) continue;
		byKey.delete(parsed.key);
		byKey.set(parsed.key, parsed);
	}
	return [...byKey.values()].slice(0, MAX_PROPERTY_FILTERS);
};

export const toFilterBy = ({
	propertyFilters,
}: {
	propertyFilters: PropertyFilter[];
}): Record<string, string> | undefined =>
	propertyFilters.length > 0
		? Object.fromEntries(propertyFilters.map(({ key, value }) => [key, value]))
		: undefined;

export const withPropertyFilter = ({
	propertyFilters,
	filter,
}: {
	propertyFilters: PropertyFilter[];
	filter: PropertyFilter;
}): string[] => [
	...withoutPropertyFilter({ propertyFilters, key: filter.key }),
	formatPropertyFilter(filter),
];

export const withoutPropertyFilter = ({
	propertyFilters,
	key,
}: {
	propertyFilters: PropertyFilter[];
	key: string;
}): string[] =>
	propertyFilters
		.filter((filter) => filter.key !== key)
		.map(formatPropertyFilter);
