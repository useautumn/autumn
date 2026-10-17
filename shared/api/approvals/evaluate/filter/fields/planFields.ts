import type {
	NumberMatcher,
	StringMatcher,
} from "../../../../common/filters/matcher";
import type { PlanFilter } from "../../../../migrations/filters/planFilter";
import type { FilterFields } from "../filterFieldTypes";
import { describeNumberMatcher } from "../format/describeNumberMatcher";
import { describeStringMatcher } from "../format/describeStringMatcher";
import { leafField } from "./leafField";

type MatchesPlan<Item> = (args: { filter: PlanFilter; item: Item }) => boolean;

const BOOLEAN_PLAN_KEYS = ["paid", "recurring", "addon", "custom"] as const;

/**
 * `PlanFilter` keys, each matched alone through the shared plan matcher so a
 * condition names its own field. `$or` is handled by `matchFilter`.
 */
export const planFields = <Item>({
	labels,
	matchesPlan,
	readPlanId,
	readVersion,
}: {
	/** Labels by `PlanFilter` key, from `APPROVAL_FILTER_FIELD_LABELS`. */
	labels: Record<string, string>;
	matchesPlan: MatchesPlan<Item>;
	readPlanId: (item: Item) => string;
	readVersion: (item: Item) => number | null;
}): FilterFields<Item> => {
	const matchesKey =
		(key: keyof PlanFilter) =>
		({ filter, parent }: { filter: unknown; parent: Item }) =>
			matchesPlan({ filter: { [key]: filter }, item: parent });

	const booleanFields = Object.fromEntries(
		BOOLEAN_PLAN_KEYS.map((key) => [
			key,
			leafField<Item>({
				label: labels[key],
				matches: matchesKey(key),
				describeCondition: ({ filter }) => filter === true,
				// Only asked on a match, where the plan's value equals the filter's.
				describeActual: ({ filter }) => filter === true,
			}),
		]),
	);

	return {
		...booleanFields,
		plan_id: leafField<Item>({
			label: labels.plan_id,
			matches: matchesKey("plan_id"),
			describeCondition: ({ filter }) =>
				describeStringMatcher({ matcher: filter as StringMatcher }),
			describeActual: ({ parent }) => readPlanId(parent),
		}),
		version: leafField<Item>({
			label: labels.version,
			matches: matchesKey("version"),
			describeCondition: ({ filter }) =>
				describeNumberMatcher({ matcher: filter as NumberMatcher }),
			describeActual: ({ parent }) => String(readVersion(parent) ?? "none"),
		}),
		price: leafField<Item>({
			label: labels.price,
			matches: matchesKey("price"),
			describeCondition: () => "matching price",
			describeActual: () => "matches",
		}),
		item: leafField<Item>({
			label: labels.item,
			matches: matchesKey("item"),
			describeCondition: () => "matching item",
			describeActual: () => "matches",
		}),
	};
};
