import { isPlainObject } from "../../../schemas/isPlainObject";
import { describeWhenLimit } from "../describeWhenLimit";
import { findWhenFailures } from "../findWhenFailures";
import type { WhenField, WhenFields } from "../whenFieldTypes";

/** `{ $eq: null }` / `{ $ne: null }`: only checks whether the object exists. */
const readNullCheck = ({ filter }: { filter: unknown }) => {
	if (filter === null) return "none";
	if (!isPlainObject(filter)) return undefined;
	if (filter.$eq === null) return "none";
	if (filter.$ne === null) return "any";
	return undefined;
};

/**
 * An object that may be absent (`next_cycle`, `refund`): `null` means "none",
 * a shape means "present and matching". Inner failures report their own path.
 */
export const nullableObjectField = <Parent, Child>({
	label,
	read,
	fields,
	describeValue,
}: {
	label: string;
	read: (parent: Parent) => Child | null;
	fields: WhenFields<Child>;
	describeValue: (child: Child) => string;
}): WhenField<Parent> => {
	const describeLimit = ({ filter }: { filter: unknown }) =>
		readNullCheck({ filter }) ??
		describeWhenLimit({ when: filter as Record<string, unknown>, fields });
	const describeActual = ({ parent }: { parent: Parent }) => {
		const child = read(parent);
		return child === null ? "none" : describeValue(child);
	};

	return {
		label,
		describeLimit,
		describeActual,
		check: ({ filter, parent, path, context }) => {
			const child = read(parent);
			const nullCheck = readNullCheck({ filter });
			const existenceMatches =
				nullCheck === undefined
					? child !== null
					: (child === null) === (nullCheck === "none");
			if (!existenceMatches) {
				return {
					field: path,
					label,
					limit: describeLimit({ filter }),
					actual: describeActual({ parent }),
				};
			}
			if (nullCheck !== undefined || child === null) return null;

			const [firstFailure] = findWhenFailures({
				when: filter as Record<string, unknown>,
				value: child,
				fields,
				path,
				context,
			});
			return firstFailure ?? null;
		},
	};
};
