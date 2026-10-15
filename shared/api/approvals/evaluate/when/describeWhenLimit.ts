import type { WhenFields, WhenFilter } from "./whenFieldTypes";

/** A whole filter as one short string, e.g. for a `$some` or `$none` element. */
export const describeWhenLimit = <Parent>({
	when,
	fields,
}: {
	when: WhenFilter;
	fields: WhenFields<Parent>;
}): string =>
	Object.entries(when)
		.flatMap(([key, filter]) => {
			if (key === "$or" || key === "$and") {
				const branches = (filter as WhenFilter[]).map((branch) =>
					describeWhenLimit({ when: branch, fields }),
				);
				const joined = branches.join(key === "$or" ? " or " : ", ");
				return branches.length > 1 ? [`(${joined})`] : [joined];
			}
			const field = fields[key];
			return field ? [String(field.describeLimit({ filter }))] : [];
		})
		.join(", ");
