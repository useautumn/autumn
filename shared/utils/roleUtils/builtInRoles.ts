import type { Role } from "../scopeDefinitions.js";

/** Built-in roles in display order; they can't be created, edited or deleted. */
export const BUILT_IN_ROLES: { id: Role; name: string }[] = [
	{ id: "owner", name: "Owner" },
	{ id: "admin", name: "Admin" },
	{ id: "developer", name: "Developer" },
	{ id: "sales", name: "Sales" },
	{ id: "member", name: "Member" },
];

export const isBuiltInRole = (id: string): id is Role =>
	BUILT_IN_ROLES.some((role) => role.id === id);
