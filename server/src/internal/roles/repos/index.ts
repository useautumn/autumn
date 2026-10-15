import { countMembersByRole } from "./countMembersByRole.js";
import { deleteCustomRole } from "./deleteCustomRole.js";
import { getCustomRole } from "./getCustomRole.js";
import { insertCustomRole } from "./insertCustomRole.js";
import { listCustomRoles } from "./listCustomRoles.js";
import { updateCustomRole } from "./updateCustomRole.js";

export const roleRepo = {
	get: getCustomRole,
	list: listCustomRoles,
	insert: insertCustomRole,
	update: updateCustomRole,
	delete: deleteCustomRole,
	countMembers: countMembersByRole,
};
