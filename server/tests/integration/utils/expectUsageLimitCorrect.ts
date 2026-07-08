import { expect } from "bun:test";
import type { ApiCustomerV5, DbUsageLimit } from "@autumn/shared";

const roundTo8Dp = (value: number) => Math.round(value * 1e8) / 1e8;

const filterMatches = (
	entryFilter: { properties?: Record<string, unknown> } | undefined,
	filterProperties: Record<string, string> | null,
) => {
	const entryProperties = entryFilter?.properties;
	if (filterProperties === null) return entryProperties == null;
	if (entryProperties == null) return false;
	const wantedKeys = Object.keys(filterProperties);
	if (Object.keys(entryProperties).length !== wantedKeys.length) return false;
	return wantedKeys.every(
		(key) => String(entryProperties[key]) === filterProperties[key],
	);
};

/**
 * Asserts the customer's `billing_controls.usage_limits` entry for a feature.
 * `filterProperties` selects among multiple entries on one feature: an object
 * matches that filter, `null` matches the unfiltered entry, `undefined` keeps
 * the legacy first-by-feature lookup.
 */
export const expectUsageLimitCorrect = ({
	customer,
	featureId,
	usage,
	limit,
	interval,
	filterProperties,
}: {
	customer: ApiCustomerV5;
	featureId: string;
	usage?: number;
	limit?: number;
	interval?: DbUsageLimit["interval"];
	filterProperties?: Record<string, string> | null;
}) => {
	const usageLimit = customer.billing_controls?.usage_limits?.find(
		(entry) =>
			entry.feature_id === featureId &&
			(filterProperties === undefined ||
				filterMatches(entry.filter, filterProperties)),
	);
	expect(
		usageLimit,
		`Missing usage_limits entry for ${featureId}${
			filterProperties ? ` with filter ${JSON.stringify(filterProperties)}` : ""
		}`,
	).toBeDefined();

	if (typeof limit !== "undefined") {
		expect(usageLimit?.limit).toBe(limit);
	}

	if (typeof interval !== "undefined") {
		expect(usageLimit?.interval).toBe(interval);
	}

	if (typeof usage !== "undefined") {
		expect(roundTo8Dp(usageLimit?.usage ?? 0)).toBe(roundTo8Dp(usage));
	}
};
