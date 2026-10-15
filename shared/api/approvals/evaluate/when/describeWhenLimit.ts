import type { WhenFields, WhenFilter } from "./whenFieldTypes";

/** A whole filter as one short string, e.g. for a `$some` or `$none` element. */
export const describeWhenLimit = <Parent>({
	when,
	fields,
}: {
	when: WhenFilter;
	fields: WhenFields<Parent>;
}) =>
	Object.entries(when)
		.filter(([key]) => fields[key] !== undefined)
		.map(([key, filter]) => String(fields[key].describeLimit({ filter })))
		.join(", ");
