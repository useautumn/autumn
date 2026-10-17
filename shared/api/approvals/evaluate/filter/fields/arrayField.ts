import { isPlainObject } from "../../../schemas/isPlainObject";
import { describeFilterCondition } from "../describeFilterCondition";
import type {
	FilterField,
	FilterFields,
	FilterMatch,
	FilterMatchContext,
} from "../filterFieldTypes";
import { matchAll } from "../matchAll";
import { matchAny } from "../matchAny";
import { matchFilter } from "../matchFilter";

const QUANTIFIERS = ["$some", "$every", "$none"] as const;

type Quantifier = (typeof QUANTIFIERS)[number];
type Quantified = Partial<Record<Quantifier, unknown>>;

/** A bare element filter means `$some`, as in migrations. */
const toQuantified = ({ filter }: { filter: unknown }): Quantified => {
	const isQuantified =
		isPlainObject(filter) &&
		QUANTIFIERS.some((quantifier) => quantifier in filter);
	return isQuantified ? filter : { $some: filter };
};

/**
 * `incoming`, `discounts`, ... `$some` reports the first matching element at
 * `path[i]`, `$every` every element, and `$none` one condition at `path`.
 */
export const arrayField = <Parent, Item>({
	label,
	read,
	element,
}: {
	label: string;
	read: (parent: Parent) => Item[];
	element: FilterFields<Item>;
}): FilterField<Parent> => {
	const describeElement = ({ filter }: { filter: unknown }) =>
		describeFilterCondition({ filter, fields: element });

	const matchQuantifier = ({
		quantifier,
		filter,
		items,
		path,
		context,
	}: {
		quantifier: Quantifier;
		filter: unknown;
		items: Item[];
		path: string;
		context: FilterMatchContext;
	}): FilterMatch => {
		const matchElement = ({ item, index }: { item: Item; index: number }) =>
			matchFilter({
				filter,
				parent: item,
				fields: element,
				path: `${path}[${index}]`,
				context,
			});
		const arrayCondition = ({
			limit,
			actual,
		}: {
			limit: string;
			actual: string;
		}) =>
			({
				result: "match",
				conditions: [{ field: path, label, limit, actual }],
			}) satisfies FilterMatch;

		if (quantifier === "$some") return matchAny({ items, match: matchElement });

		if (quantifier === "$every") {
			// Vacuously true on an empty list; shown so a block that fires on "no plans" says why.
			if (items.length === 0)
				return arrayCondition({
					limit: `every ${describeElement({ filter })}`,
					actual: "none",
				});
			return matchAll({ items, match: matchElement });
		}

		const anyElement = matchAny({ items, match: matchElement });
		if (anyElement.result === "match") return { result: "no_match" };
		if (anyElement.result === "unsupported") return anyElement;
		return arrayCondition({
			limit: `not ${describeElement({ filter })}`,
			actual: "none match",
		});
	};

	return {
		label,
		fields: element,
		describeCondition: ({ filter }) => {
			const { $some, $every, $none } = toQuantified({ filter });
			const parts = [
				$every !== undefined && `every ${describeElement({ filter: $every })}`,
				$some !== undefined && `some ${describeElement({ filter: $some })}`,
				$none !== undefined && `not ${describeElement({ filter: $none })}`,
			];
			return parts.filter(Boolean).join(", ");
		},
		match: ({ filter, parent, path, context }) => {
			const items = read(parent);
			const quantified = toQuantified({ filter });
			const quantifiers = QUANTIFIERS.filter(
				(quantifier) => quantified[quantifier] !== undefined,
			);
			return matchAll({
				items: quantifiers,
				match: ({ item: quantifier }) =>
					matchQuantifier({
						quantifier,
						filter: quantified[quantifier],
						items,
						path,
						context,
					}),
			});
		},
	};
};
