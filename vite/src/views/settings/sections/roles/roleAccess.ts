import {
	RESOURCE_METADATA,
	RESOURCES,
	type ResourceType,
	type ScopeString,
} from "@autumn/shared";

// Mirrors §R of approvals-api-schema.md until D4 exports these from @autumn/shared.
export type RoleAccess = "none" | "read" | "write";
export type RoleAccessRecord = Record<ResourceType, RoleAccess>;

export type Role = {
	name: string;
	label: string;
	built_in: boolean;
	access: RoleAccessRecord;
	member_count: number;
	created_at: number | null;
	updated_at: number | null;
};

export type RoleBody = Pick<Role, "name" | "label" | "access">;
export type RoleFormValues = Pick<Role, "label" | "access">;

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

export const canEditRole = ({ role }: { role: Role }) => !role.built_in;

export const roleToFormValues = ({
	role,
}: {
	role: Role | null;
}): RoleFormValues => ({
	label: role?.label ?? "",
	access: role?.access ?? emptyAccess(),
});

const labelToName = ({ label }: { label: string }) =>
	label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\s_]/g, "")
		.replace(/\s+/g, "_");

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
