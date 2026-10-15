import type { ApprovalViolation } from "../types/approvalVerdict";
import { findWhenFailures } from "./findWhenFailures";
import { joinFieldPath } from "./joinFieldPath";
import type {
	WhenFields,
	WhenFilter,
	WhenMatchContext,
} from "./whenFieldTypes";

/**
 * Null when any branch matches. A group over one field (the editor's "< 2
 * months" row) reports that field; otherwise the closest branch's first failure.
 */
export const findOrGroupFailure = <Parent>({
	branches,
	value,
	fields,
	path,
	context,
}: {
	branches: WhenFilter[];
	value: Parent;
	fields: WhenFields<Parent>;
	path: string;
	context: WhenMatchContext;
}): ApprovalViolation | null => {
	// Saved rules can't hold an empty group; if one slips through, fail closed.
	if (branches.length === 0) {
		return {
			field: path || "$or",
			label: "Conditions",
			limit: "no conditions",
			actual: "no match",
		};
	}

	const branchFailures = branches.map((branch) =>
		findWhenFailures({ when: branch, value, fields, path, context }),
	);
	const anyBranchMatches = branchFailures.some(
		(failures) => failures.length === 0,
	);
	if (anyBranchMatches) return null;

	const keys = [...new Set(branches.flatMap((branch) => Object.keys(branch)))];
	const onlyField = keys.length === 1 ? fields[keys[0]] : undefined;
	if (!onlyField) {
		const closest = branchFailures.reduce((best, failures) =>
			failures.length < best.length ? failures : best,
		);
		return closest[0];
	}

	// A `null` branch only says "none is fine too", so it isn't shown as a limit.
	const filters = branches
		.map((branch) => branch[keys[0]])
		.filter((filter) => filter !== null);
	const allowsOnlyNone = filters.length === 0;
	const limit = allowsOnlyNone
		? "none"
		: (onlyField.describeLimits?.({ filters }) ??
			filters
				.map((filter) => String(onlyField.describeLimit({ filter })))
				.join(" or "));

	return {
		field: joinFieldPath({ path, key: keys[0] }),
		label: onlyField.label,
		limit,
		actual: onlyField.describeActual({
			filter: filters[0],
			parent: value,
			context,
		}),
	};
};
