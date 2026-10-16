import type {
	PermissionDenial,
	PermissionViolation,
} from "./permissionSchemas";

const LEVEL_LABELS: Record<PermissionDenial["decided_by"]["level"], string> = {
	user: "Member rule",
	role: "Role rule",
	everyone: "Everyone rule",
};

const formatValue = (value: PermissionViolation["limit"]) => {
	if (typeof value === "boolean") return value ? "yes" : "no";
	return String(value);
};

const COMPARISON = /^[<>≤≥≠]/;

/** A matched condition of the deciding block rule: "Plan: Enterprise", "Total ≥ 500 (this request: 900)". */
export const formatViolation = ({
	violation,
}: {
	violation: PermissionViolation;
}) => {
	const { label, limit, actual } = violation;
	if (typeof limit === "boolean") return `${label}: ${formatValue(actual)}`;

	const condition = COMPARISON.test(limit)
		? `${label} ${limit}`
		: `${label}: ${limit}`;
	if (actual === limit) return condition;
	return `${condition} (this request: ${formatValue(actual)})`;
};

export const formatDecidedBy = ({ denial }: { denial: PermissionDenial }) =>
	`${LEVEL_LABELS[denial.decided_by.level]} · ${denial.decided_by.rule_name}`;

const joinWithOr = ({ items }: { items: string[] }) => {
	if (items.length <= 1) return items[0] ?? "";
	return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
};

/** Only roles with an allow rule that would match; nobody is added implicitly. */
export const formatAskRoles = ({
	denial,
	roleName,
}: {
	denial: PermissionDenial;
	roleName: (id: string) => string;
}) => {
	if (denial.allowed_roles.length === 0) {
		return "Ask an owner or admin to change this rule";
	}
	const names = denial.allowed_roles.map(roleName);
	return `Ask someone with the ${joinWithOr({ items: names })} role`;
};
