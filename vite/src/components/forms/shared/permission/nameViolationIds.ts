import type { PermissionViolation } from "./permissionSchemas";

export type DenialNames = Record<
	"plan" | "feature" | "reward",
	Record<string, string>
>;

const ID_KIND_BY_KEY: Record<string, keyof DenialNames> = {
	plan_id: "plan",
	plan: "plan",
	feature_id: "feature",
	reward_id: "reward",
};

const fieldKey = ({ field }: { field: string }) =>
	field
		.split(".")
		.at(-1)
		?.replace(/\[\d+\]$/, "") ?? field;

/** Violation values carry ids ("pro or team", "not pro"); show each id as its catalog name, or as is. */
export const nameViolationIds = ({
	violation,
	names,
}: {
	violation: PermissionViolation;
	names: DenialNames;
}): PermissionViolation => {
	const kind = ID_KIND_BY_KEY[fieldKey({ field: violation.field })];
	if (!kind) return violation;

	const byId = names[kind];
	const name = (value: PermissionViolation["limit"]) =>
		typeof value === "string"
			? value.replace(/[^\s,]+/g, (token) => byId[token] ?? token)
			: value;
	return {
		...violation,
		limit: name(violation.limit),
		actual: name(violation.actual),
	};
};
