import type { ApprovalViolation } from "../types/approvalVerdict";
import { findOrGroupFailure } from "./findOrGroupFailure";
import { joinFieldPath } from "./joinFieldPath";
import type {
	WhenFields,
	WhenFilter,
	WhenMatchContext,
} from "./whenFieldTypes";

/**
 * One violation per failed condition: each field key is one condition, and so
 * is each `$or` / `$and` group. An empty list means the filter matches.
 */
export const findWhenFailures = <Parent>({
	when,
	value,
	fields,
	path,
	context,
}: {
	when: WhenFilter;
	value: Parent;
	fields: WhenFields<Parent>;
	path: string;
	context: WhenMatchContext;
}): ApprovalViolation[] =>
	Object.entries(when).flatMap(([key, filter]): ApprovalViolation[] => {
		if (filter === undefined) return [];

		if (key === "$or") {
			const failure = findOrGroupFailure({
				branches: filter as WhenFilter[],
				value,
				fields,
				path,
				context,
			});
			return failure ? [failure] : [];
		}

		if (key === "$and") {
			const firstFailure = (filter as WhenFilter[])
				.flatMap((branch) =>
					findWhenFailures({ when: branch, value, fields, path, context }),
				)
				.at(0);
			return firstFailure ? [firstFailure] : [];
		}

		const fieldPath = joinFieldPath({ path, key });
		const field = fields[key];
		// Saved rules can't hold unknown fields; if one slips through, fail closed.
		if (!field) {
			return [
				{
					field: fieldPath,
					label: key,
					limit: "unsupported",
					actual: "unsupported",
				},
			];
		}

		const failure = field.check({
			filter,
			parent: value,
			path: fieldPath,
			context,
		});
		return failure ? [failure] : [];
	});
