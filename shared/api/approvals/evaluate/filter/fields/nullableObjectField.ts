import { isPlainObject } from "../../../schemas/isPlainObject";
import { describeFilterCondition } from "../describeFilterCondition";
import type { FilterField, FilterFields } from "../filterFieldTypes";
import { matchFilter } from "../matchFilter";

/** `null` / `{ $eq: null }` → "none"; `{ $ne: null }` → "any"; a shape → undefined. */
const readNullCheck = ({ filter }: { filter: unknown }) => {
	if (filter === null) return "none";
	if (!isPlainObject(filter)) return undefined;
	if (filter.$eq === null) return "none";
	if (filter.$ne === null) return "any";
	return undefined;
};

/**
 * An object that may be absent (`entity`, `free_trial`, `refund`): `null` means
 * none, `{ $ne: null }` any, and a shape means present with matching fields.
 */
export const nullableObjectField = <Parent, Child>({
	label,
	read,
	fields,
	describeValue,
}: {
	label: string;
	read: (parent: Parent) => Child | null;
	fields: FilterFields<Child>;
	describeValue: (child: Child) => string;
}): FilterField<Parent> => ({
	label,
	fields,
	describeCondition: ({ filter }) =>
		readNullCheck({ filter }) ?? describeFilterCondition({ filter, fields }),
	match: ({ filter, parent, path, context }) => {
		const child = read(parent);
		const nullCheck = readNullCheck({ filter });

		if (nullCheck !== undefined) {
			const childMatches = (child === null) === (nullCheck === "none");
			if (!childMatches) return { result: "no_match" };
			const actual = child === null ? "none" : describeValue(child);
			return {
				result: "match",
				conditions: [{ field: path, label, limit: nullCheck, actual }],
			};
		}

		if (child === null) return { result: "no_match" };
		const inner = matchFilter({ filter, parent: child, fields, path, context });

		// `{}` only asks that the object exists; say so rather than match silently.
		const matchedWithoutConditions =
			inner.result === "match" && inner.conditions.length === 0;
		if (!matchedWithoutConditions) return inner;
		return {
			result: "match",
			conditions: [
				{ field: path, label, limit: "any", actual: describeValue(child) },
			],
		};
	},
});
