import {
	type DbUsageLimit,
	USAGE_LIMIT_FILTER_MAX_KEY_LENGTH,
	USAGE_LIMIT_FILTER_MAX_KEYS,
	USAGE_LIMIT_FILTER_MAX_VALUE_LENGTH,
} from "@autumn/shared";
import type { UsageLimitCondition } from "./UsageLimitConditionRows";

export const conditionsFromFilter = (
	filter: DbUsageLimit["filter"],
): UsageLimitCondition[] =>
	Object.entries(filter?.properties ?? {}).map(([key, value]) => ({
		key,
		value: String(value),
	}));

/** Trimmed, non-empty rows -> filter.properties; error on partial rows. */
export const conditionsToFilter = (
	conditions: UsageLimitCondition[],
): { filter?: DbUsageLimit["filter"]; error?: string } => {
	const filled = conditions
		.map(({ key, value }) => ({ key: key.trim(), value: value.trim() }))
		.filter(({ key, value }) => key || value);
	if (filled.length === 0) return {};

	if (filled.some(({ key, value }) => !key || !value)) {
		return { error: "Each condition needs both a property and a value" };
	}
	if (filled.length > USAGE_LIMIT_FILTER_MAX_KEYS) {
		return {
			error: `At most ${USAGE_LIMIT_FILTER_MAX_KEYS} conditions are allowed`,
		};
	}
	if (
		filled.some(({ key }) => key.length > USAGE_LIMIT_FILTER_MAX_KEY_LENGTH)
	) {
		return {
			error: `Property names must be at most ${USAGE_LIMIT_FILTER_MAX_KEY_LENGTH} characters`,
		};
	}
	if (
		filled.some(
			({ value }) => value.length > USAGE_LIMIT_FILTER_MAX_VALUE_LENGTH,
		)
	) {
		return {
			error: `Values must be at most ${USAGE_LIMIT_FILTER_MAX_VALUE_LENGTH} characters`,
		};
	}
	const keys = filled.map(({ key }) => key);
	const duplicateKey = keys.find((key, index) => keys.indexOf(key) !== index);
	if (duplicateKey) {
		return {
			error: `"${duplicateKey}" can only be used once. To cap several values, create a separate limit for each.`,
		};
	}

	return {
		filter: {
			properties: Object.fromEntries(
				filled.map(({ key, value }) => [key, value]),
			),
		},
	};
};
