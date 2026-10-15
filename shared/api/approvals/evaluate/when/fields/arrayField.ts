import type { ArrayQuantifierFilter } from "../../../../common/filters/match/arrayFilterMatches";
import { describeWhenLimit } from "../describeWhenLimit";
import { findWhenFailures } from "../findWhenFailures";
import type {
	WhenField,
	WhenFields,
	WhenFilter,
	WhenMatchContext,
} from "../whenFieldTypes";

type Quantified = {
	$some?: WhenFilter;
	$every?: WhenFilter;
	$none?: WhenFilter;
};

/** A bare element filter means `$some`, as in migrations. */
const toQuantified = ({ filter }: { filter: unknown }): Quantified => {
	const value = filter as ArrayQuantifierFilter<WhenFilter>;
	const isQuantified =
		"$some" in value || "$every" in value || "$none" in value;
	return isQuantified ? (value as Quantified) : { $some: value as WhenFilter };
};

/**
 * `incoming`, `discounts`, ... Violations point at the first failing element,
 * e.g. `discounts[1].percent_off` for `$every`.
 */
export const arrayField = <Parent, Item>({
	label,
	read,
	element,
}: {
	label: string;
	read: (parent: Parent) => Item[];
	element: WhenFields<Item>;
}): WhenField<Parent> => {
	const failuresOf = ({
		when,
		item,
		path,
		context,
	}: {
		when: WhenFilter;
		item: Item;
		path: string;
		context: WhenMatchContext;
	}) => findWhenFailures({ when, value: item, fields: element, path, context });

	const describeLimit = ({ filter }: { filter: unknown }) => {
		const { $some, $every, $none } = toQuantified({ filter });
		const parts = [
			$every && describeWhenLimit({ when: $every, fields: element }),
			$some && `some ${describeWhenLimit({ when: $some, fields: element })}`,
			$none && `not ${describeWhenLimit({ when: $none, fields: element })}`,
		];
		return parts.filter(Boolean).join(", ");
	};

	return {
		label,
		describeLimit,
		describeActual: ({ parent }) => String(read(parent).length),
		check: ({ filter, parent, path, context }) => {
			const items = read(parent);
			const { $some, $every, $none } = toQuantified({ filter });

			if ($every) {
				for (const [index, item] of items.entries()) {
					const [failure] = failuresOf({
						when: $every,
						item,
						path: `${path}[${index}]`,
						context,
					});
					if (failure) return failure;
				}
			}

			if ($none) {
				const index = items.findIndex(
					(item) =>
						failuresOf({ when: $none, item, path, context }).length === 0,
				);
				if (index !== -1) {
					return {
						field: `${path}[${index}]`,
						label,
						limit: `not ${describeWhenLimit({ when: $none, fields: element })}`,
						actual: "matches",
					};
				}
			}

			const someMatches =
				$some !== undefined &&
				items.some(
					(item) =>
						failuresOf({ when: $some, item, path, context }).length === 0,
				);
			if ($some && !someMatches) {
				return {
					field: path,
					label,
					limit: `some ${describeWhenLimit({ when: $some, fields: element })}`,
					actual: "none",
				};
			}

			return null;
		},
	};
};
