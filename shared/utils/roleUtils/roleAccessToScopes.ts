import type { RoleAccessMap } from "../../api/roles/roleAccess.js";
import { RESOURCES, type ScopeString } from "../scopeDefinitions.js";

/** Write implies read, so each granted resource contributes one scope. */
export const roleAccessToScopes = ({
	access,
}: {
	access: RoleAccessMap;
}): ScopeString[] =>
	RESOURCES.flatMap((resource) => {
		const level = access[resource];
		if (level === "none") return [];
		return [`${resource}:${level}` as ScopeString];
	});
