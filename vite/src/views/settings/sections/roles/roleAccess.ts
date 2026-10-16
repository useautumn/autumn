import {
	RESOURCE_METADATA,
	RESOURCES,
	type ResourceType,
	type ScopeString,
} from "@autumn/shared";
import type { RoleOption } from "@/components/v2/selects/RoleSelect";

// Mirrors ApiRole; import it from @autumn/shared/api/roles/apiRole once #4992 merges.
export type RoleAccess = "none" | "read" | "write";
export type RoleAccessRecord = Record<ResourceType, RoleAccess>;

export type ApiRole = {
	name: string;
	label: string;
	built_in: boolean;
	access: RoleAccessRecord;
	member_count: number;
	rule_count: number;
	created_at: number | null;
	updated_at: number | null;
};

export type RoleBody = Pick<ApiRole, "name" | "label" | "access">;
export type RoleFormValues = Pick<ApiRole, "label" | "access">;

const READ_ONLY_RESOURCES: readonly ResourceType[] = ["analytics"];

const capAccess = ({
	resource,
	value,
}: {
	resource: ResourceType;
	value: RoleAccess;
}): RoleAccess =>
	value === "write" && READ_ONLY_RESOURCES.includes(resource) ? "read" : value;

const buildAccess = (pick: (resource: ResourceType) => RoleAccess) =>
	Object.fromEntries(
		RESOURCES.map((resource) => [
			resource,
			capAccess({ resource, value: pick(resource) }),
		]),
	) as RoleAccessRecord;

const capRecord = ({ access }: { access: RoleAccessRecord }) =>
	buildAccess((resource) => access[resource]);

export const emptyAccess = () => buildAccess(() => "none");

export const accessToScopes = ({
	access,
}: {
	access: RoleAccessRecord;
}): ScopeString[] =>
	Object.entries(capRecord({ access }))
		.filter(([, value]) => value !== "none")
		.map(([resource, value]) => `${resource}:${value}` as ScopeString);

export const scopesToAccess = ({
	scopes,
}: {
	scopes: readonly ScopeString[];
}): RoleAccessRecord => {
	const has = (scope: string) => scopes.includes(scope as ScopeString);
	return buildAccess((resource) => {
		if (has(`${resource}:write`)) return "write";
		if (has(`${resource}:read`)) return "read";
		return "none";
	});
};

export const accessError = ({ access }: { access: RoleAccessRecord }) =>
	Object.values(access).some((value) => value !== "none")
		? undefined
		: "Choose access to at least one resource";

export const canEditRole = ({ role }: { role: ApiRole }) => !role.built_in;

export const roleToFormValues = ({
	role,
}: {
	role: ApiRole | null;
}): RoleFormValues => ({
	label: role?.label ?? "",
	access: role?.access ?? emptyAccess(),
});

const ROLE_NAME_MAX_LENGTH = 63;

export const labelToName = ({ label }: { label: string }) =>
	label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\s_]/g, "")
		.replace(/\s+/g, "_")
		.replace(/^_+/, "")
		.slice(0, ROLE_NAME_MAX_LENGTH);

export const formValuesToRoleBody = ({
	values,
}: {
	values: RoleFormValues;
}): RoleBody => ({
	name: labelToName({ label: values.label }),
	label: values.label.trim(),
	access: capRecord({ access: values.access }),
});

const SUMMARY_LIMIT = 3;

// Lowercases words but keeps acronyms, so "API Keys" reads "API keys".
const resourceName = ({ resource }: { resource: ResourceType }) =>
	RESOURCE_METADATA[resource].namePlural
		.split(" ")
		.map((word) => (word === word.toUpperCase() ? word : word.toLowerCase()))
		.join(" ");

const listResources = ({ resources }: { resources: ResourceType[] }) => {
	const names = resources
		.slice(0, SUMMARY_LIMIT)
		.map((resource) => resourceName({ resource }))
		.join(", ");
	const hidden = resources.length - SUMMARY_LIMIT;
	return hidden > 0 ? `${names} +${hidden} more` : names;
};

export const summarizeAccess = ({
	access,
}: {
	access: RoleAccessRecord;
}): string => {
	const written = RESOURCES.filter((resource) => access[resource] === "write");
	if (
		RESOURCES.every(
			(resource) =>
				access[resource] === capAccess({ resource, value: "write" }),
		)
	)
		return "Full access";
	if (written.length > 0)
		return `Write ${listResources({ resources: written })}`;
	if (RESOURCES.some((resource) => access[resource] === "read"))
		return "Read only";
	return "No access";
};

export const RULE_EXEMPT_ROLES = ["owner", "admin"];

export const summarizeRules = ({ role }: { role: ApiRole }) => {
	if (RULE_EXEMPT_ROLES.includes(role.name)) return "Skips rules";
	if (role.rule_count === 0) return "No rules";
	return role.rule_count === 1 ? "1 rule" : `${role.rule_count} rules`;
};

/** A deleted role's members still carry its slug, so fall back to the raw name. */
export const roleLabel = ({
	roles,
	name,
}: {
	roles: ApiRole[];
	name: string;
}) => roles.find((role) => role.name === name)?.label ?? name;

export const memberRoleOptions = ({
	roles,
	allowOwner,
}: {
	roles: ApiRole[];
	allowOwner: boolean;
}): RoleOption[] =>
	roles
		.filter((role) => allowOwner || role.name !== "owner")
		.map((role) => ({
			value: role.name,
			label: role.label,
			description: summarizeAccess({ access: role.access }),
		}));
