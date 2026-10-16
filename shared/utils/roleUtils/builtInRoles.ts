import type { Role } from "../scopeDefinitions.js";

/** Built-in roles in display order; they can't be created, edited or deleted. */
export const BUILT_IN_ROLES: { name: Role; label: string }[] = [
	{ name: "owner", label: "Owner" },
	{ name: "admin", label: "Admin" },
	{ name: "developer", label: "Developer" },
	{ name: "sales", label: "Sales" },
	{ name: "member", label: "Member" },
];

export const isBuiltInRole = (name: string): name is Role =>
	BUILT_IN_ROLES.some((role) => role.name === name);
