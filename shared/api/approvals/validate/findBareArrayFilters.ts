import { ARRAY_QUANTIFIERS } from "../schemas/filters/filterFields";
import type { ApprovalRuleIssue, FilterEntry } from "./types";

const ARRAY_FILTER_KEYS = new Set([
	"incoming",
	"outgoing",
	"discounts",
	"feature_quantities",
	"plan",
	"item",
]);

const isBareArrayFilter = ({ key, value }: FilterEntry) =>
	ARRAY_FILTER_KEYS.has(key) &&
	typeof value === "object" &&
	value !== null &&
	!ARRAY_QUANTIFIERS.some((quantifier) => quantifier in value);

/**
 * A bare array filter means `$some`, which gets limits wrong: a discount cap
 * would deny every request with no discount. Rules must say which they mean.
 */
export const findBareArrayFilters = ({
	entries,
}: {
	entries: FilterEntry[];
}): ApprovalRuleIssue[] =>
	entries.filter(isBareArrayFilter).map((entry) => ({
		path: entry.path.join("."),
		message:
			"Choose whether every item ($every), no item ($none) or some item ($some) must match.",
	}));
