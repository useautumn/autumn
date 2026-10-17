import { BUILT_IN_ROLES } from "@autumn/shared/utils/roleUtils/builtInRoles";

/** The decision a rule denied with: a preview's `permission` or a 403's `details`. */
export type PermissionDenial = {
	message: string;
	violations: {
		label: string;
		limit: string | boolean;
		actual: string | boolean;
	}[];
	allowed_roles: string[];
};

const formatValue = (value: string | boolean) => {
	if (value === true) return "Yes";
	if (value === false) return "No";
	return value;
};

/** A built-in role reads as its name; a custom role id is shown as it is. */
const formatRole = (roleId: string) =>
	BUILT_IN_ROLES.find(({ id }) => id === roleId)?.name ?? roleId;

/** The designs' denial: the rule's note, each limit vs this request, and who can approve instead. */
export const permissionDenialText = ({
	denial,
}: {
	denial: PermissionDenial;
}) =>
	[
		`You can't approve this. ${denial.message}`,
		...denial.violations.map(
			({ label, limit, actual }) =>
				`• ${label}: limit ${formatValue(limit)}, this request ${formatValue(actual)}`,
		),
		...(denial.allowed_roles.length > 0
			? [
					`Who can approve it: ${denial.allowed_roles.map(formatRole).join(", ")}.`,
				]
			: []),
	].join("\n");
