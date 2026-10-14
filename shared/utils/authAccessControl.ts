import { createAccessControl } from "better-auth/plugins/access";
import {
	adminAc,
	defaultStatements,
	memberAc,
	ownerAc,
} from "better-auth/plugins/organization/access";

export const ac = createAccessControl(defaultStatements);

export const developerRole = ac.newRole({
	organization: [],
	member: [],
	invitation: [],
	team: [],
	ac: ["read"],
});

export const salesRole = ac.newRole({
	organization: [],
	member: [],
	invitation: [],
	team: [],
	ac: ["read"],
});

export const roles = {
	owner: ownerAc,
	admin: adminAc,
	developer: developerRole,
	sales: salesRole,
	member: memberAc,
} as const;
