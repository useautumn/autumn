import type {
	NumberMatcher,
	StringMatcher,
} from "../../../../common/filters/matcher";
import type { PlanFilter } from "../../../../migrations/filters/planFilter";
import { describeNumberMatcher } from "../format/describeNumberMatcher";
import { describeStringMatcher } from "../format/describeStringMatcher";
import type { WhenFields } from "../whenFieldTypes";
import { leafField } from "./leafField";

type MatchesPlan<Item> = (args: { filter: PlanFilter; item: Item }) => boolean;

const BOOLEAN_PLAN_KEYS = ["paid", "recurring", "addon", "custom"] as const;

/**
 * `PlanFilter` keys, each checked alone through the existing plan matcher so
 * a failure names its field. `$or` is handled by `findWhenFailures`.
 */
export const planFields = <Item>({
	labels,
	matchesPlan,
	readPlanId,
	readVersion,
}: {
	/** Labels by `PlanFilter` key, from `WHEN_FIELD_LABELS`. */
	labels: Record<string, string>;
	matchesPlan: MatchesPlan<Item>;
	readPlanId: (item: Item) => string;
	readVersion: (item: Item) => number | null;
}): WhenFields<Item> => {
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
				describeLimit: ({ filter }) => filter === true,
				// Only asked after a mismatch, so the actual is the opposite of the limit.
				describeActual: ({ filter }) => filter !== true,
			}),
		]),
	);

	return {
		...booleanFields,
		plan_id: leafField<Item>({
			label: labels.plan_id,
			matches: matchesKey("plan_id"),
			describeLimit: ({ filter }) =>
				describeStringMatcher({ matcher: filter as StringMatcher }),
			describeActual: ({ parent }) => readPlanId(parent),
		}),
		version: leafField<Item>({
			label: labels.version,
			matches: matchesKey("version"),
			describeLimit: ({ filter }) =>
				describeNumberMatcher({ matcher: filter as NumberMatcher }),
			describeActual: ({ parent }) => String(readVersion(parent) ?? "none"),
		}),
		price: leafField<Item>({
			label: labels.price,
			matches: matchesKey("price"),
			describeLimit: () => "matching price",
			describeActual: () => "no match",
		}),
		item: leafField<Item>({
			label: labels.item,
			matches: matchesKey("item"),
			describeLimit: () => "matching item",
			describeActual: () => "no match",
		}),
	};
};
