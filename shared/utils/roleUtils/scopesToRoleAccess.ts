import type { RoleAccess, RoleAccessMap } from "../../api/roles/roleAccess.js";
import {
	expandScopes,
	RESOURCES,
	type ResourceType,
	type ScopeString,
} from "../scopeDefinitions.js";

/** Coarse access a scope set grants; the `admin` meta-scope expands to every resource. */
export const scopesToRoleAccess = ({
	scopes,
}: {
	scopes: readonly string[];
}): RoleAccessMap => {
	const granted = expandScopes(scopes);
	const accessFor = (resource: ResourceType): RoleAccess => {
		if (granted.has(`${resource}:write` as ScopeString)) return "write";
		if (granted.has(`${resource}:read` as ScopeString)) return "read";
		return "none";
	};
	return Object.fromEntries(
		RESOURCES.map((resource) => [resource, accessFor(resource)]),
	) as RoleAccessMap;
};
