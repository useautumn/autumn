import type { NumberMatcher, StringMatcher } from "@api/common/filters/matcher";
import type { PlanFilter } from "@api/migrations/filters/planFilter";
import { describeNumberMatcher } from "../format/describeNumberMatcher";
import { describeStringMatcher } from "../format/describeStringMatcher";
import type { WhenFields } from "../whenFieldTypes";
import { leafField } from "./leafField";

type MatchesPlan<Item> = (args: { filter: PlanFilter; item: Item }) => boolean;

const BOOLEAN_PLAN_LABELS = {
	paid: "Paid plan",
	recurring: "Recurring",
	addon: "Add-on",
	custom: "Custom plan",
} as const;

/**
 * `PlanFilter` keys, each checked alone through the existing plan matcher so
 * a failure names its field. `$or` is handled by `findWhenFailures`.
 */
export const planFields = <Item>({
	planLabel,
	matchesPlan,
	readPlanId,
	readVersion,
}: {
	planLabel: string;
	matchesPlan: MatchesPlan<Item>;
	readPlanId: (item: Item) => string;
	readVersion: (item: Item) => number | null;
}): WhenFields<Item> => {
	const matchesKey =
		(key: keyof PlanFilter) =>
		({ filter, parent }: { filter: unknown; parent: Item }) =>
			matchesPlan({ filter: { [key]: filter }, item: parent });

	const booleanFields = Object.fromEntries(
		Object.entries(BOOLEAN_PLAN_LABELS).map(([key, label]) => [
			key,
			leafField<Item>({
				label,
				matches: matchesKey(key as keyof PlanFilter),
				describeLimit: ({ filter }) => filter === true,
				// Only asked after a mismatch, so the actual is the opposite of the limit.
				describeActual: ({ filter }) => filter !== true,
			}),
		]),
	);

	return {
		...booleanFields,
		plan_id: leafField<Item>({
			label: planLabel,
			matches: matchesKey("plan_id"),
			describeLimit: ({ filter }) =>
				describeStringMatcher({ matcher: filter as StringMatcher }),
			describeActual: ({ parent }) => readPlanId(parent),
		}),
		version: leafField<Item>({
			label: "Plan version",
			matches: matchesKey("version"),
			describeLimit: ({ filter }) =>
				describeNumberMatcher({ matcher: filter as NumberMatcher }),
			describeActual: ({ parent }) => String(readVersion(parent) ?? "none"),
		}),
		price: leafField<Item>({
			label: "Price",
			matches: matchesKey("price"),
			describeLimit: () => "matching price",
			describeActual: () => "no match",
		}),
		item: leafField<Item>({
			label: "Item",
			matches: matchesKey("item"),
			describeLimit: () => "matching item",
			describeActual: () => "no match",
		}),
	};
};
