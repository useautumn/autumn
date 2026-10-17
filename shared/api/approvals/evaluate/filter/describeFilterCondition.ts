import { isPlainObject } from "../../schemas/isPlainObject";
import type { FilterFields } from "./filterFieldTypes";

/** A whole filter as one short phrase, e.g. for a `$none` or empty `$every` element. */
export const describeFilterCondition = <Parent>({
	filter,
	fields,
}: {
	filter: unknown;
	fields: FilterFields<Parent>;
}): string => {
	if (!isPlainObject(filter)) return "unsupported";

	return Object.entries(filter)
		.flatMap(([key, value]) => {
			if (key === "$or" || key === "$and") {
				const branches = Array.isArray(value) ? value : [];
				const described = branches.map((branch) =>
					describeFilterCondition({ filter: branch, fields }),
				);
				const joined = described.join(key === "$or" ? " or " : ", ");
				return described.length > 1 ? [`(${joined})`] : [joined];
			}
			const field = fields[key];
			return field ? [String(field.describeCondition({ filter: value }))] : [];
		})
		.join(", ");
};
