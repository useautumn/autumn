import { ROLE_SCOPES, type ScopeString } from "@autumn/shared";
import { AxiosError, AxiosHeaders, type AxiosInstance } from "axios";
import { type ApiRole, type RoleBody, scopesToAccess } from "./roleAccess";

export type RolesClient = {
	list: () => Promise<ApiRole[]>;
	create: (params: { body: RoleBody }) => Promise<ApiRole>;
	update: (params: {
		name: string;
		body: Partial<RoleBody>;
	}) => Promise<ApiRole>;
	remove: (params: { name: string }) => Promise<void>;
};

type RoleErrorBody = {
	code: string;
	message: string;
	details?: { member_count?: number };
};

// D4's routes aren't merged yet: flip to false once they are.
export const ROLES_MOCKED = true;

export const createHttpRolesClient = ({
	axios,
}: {
	axios: AxiosInstance;
}): RolesClient => ({
	list: async () => (await axios.get<{ list: ApiRole[] }>("/roles")).data.list,
	create: async ({ body }) => (await axios.post<ApiRole>("/roles", body)).data,
	update: async ({ name, body }) =>
		(await axios.patch<ApiRole>(`/roles/${name}`, body)).data,
	remove: async ({ name }) => {
		await axios.delete(`/roles/${name}`);
	},
});

export const getRoleInUseCount = ({ error }: { error: unknown }) => {
	if (!(error instanceof AxiosError)) return null;
	const data = error.response?.data as RoleErrorBody | undefined;
	if (data?.code !== "role_in_use") return null;
	return data.details?.member_count ?? null;
};

const rejectWith = ({
	status,
	body,
}: {
	status: number;
	body: RoleErrorBody;
}) => {
	const headers = new AxiosHeaders();
	throw new AxiosError(body.message, undefined, undefined, undefined, {
		status,
		statusText: body.code,
		data: body,
		headers,
		config: { headers },
	});
};

const MOCK_ROLES: [
	label: string,
	scopes: ScopeString[],
	members: number,
	rules: number,
][] = [
	["Owner", ROLE_SCOPES.owner, 1, 0],
	["Admin", ROLE_SCOPES.admin, 3, 0],
	["Developer", ROLE_SCOPES.developer, 6, 0],
	["Sales", ROLE_SCOPES.sales, 8, 2],
	["Member", ROLE_SCOPES.member, 5, 0],
	["Support", [...ROLE_SCOPES.member, "balances:write"], 4, 1],
	[
		"Finance",
		[...ROLE_SCOPES.member, "customers:write", "billing:write"],
		0,
		1,
	],
];

const BUILT_IN_COUNT = 5;

const seedRoles = (): ApiRole[] =>
	MOCK_ROLES.map(([label, scopes, members, rules], index) => {
		const built_in = index < BUILT_IN_COUNT;
		return {
			name: label.toLowerCase(),
			label,
			built_in,
			access: scopesToAccess({ scopes }),
			member_count: members,
			rule_count: rules,
			created_at: built_in ? null : Date.now(),
			updated_at: built_in ? null : Date.now(),
		};
	});

const sortRoles = ({ roles }: { roles: ApiRole[] }) => [
	...roles.filter((role) => role.built_in),
	...roles
		.filter((role) => !role.built_in)
		.sort((a, b) => a.label.localeCompare(b.label)),
];

const findMockRole = ({ roles, name }: { roles: ApiRole[]; name: string }) => {
	const role = roles.find((candidate) => candidate.name === name);
	if (!role)
		return rejectWith({
			status: 404,
			body: { code: "role_not_found", message: "Role not found" },
		});
	if (role.built_in)
		return rejectWith({
			status: 400,
			body: {
				code: "role_built_in",
				message: "Built-in roles can't be changed",
			},
		});
	return role;
};

const assertNameFree = ({
	roles,
	name,
	except,
}: {
	roles: ApiRole[];
	name: string;
	except?: ApiRole;
}) => {
	if (roles.some((role) => role.name === name && role !== except))
		rejectWith({
			status: 409,
			body: { code: "role_exists", message: "A role with this name exists" },
		});
};

const mockStores = new Map<string, ApiRole[]>();

/** One in-memory store per org and env, so switching orgs doesn't carry edits across. */
export const getMockRolesClient = ({
	storeKey,
}: {
	storeKey: string;
}): RolesClient => {
	const roles = mockStores.get(storeKey) ?? seedRoles();
	mockStores.set(storeKey, roles);

	return {
		list: async () => sortRoles({ roles }),
		create: async ({ body }) => {
			assertNameFree({ roles, name: body.name });
			const role: ApiRole = {
				...body,
				built_in: false,
				member_count: 0,
				rule_count: 0,
				created_at: Date.now(),
				updated_at: Date.now(),
			};
			roles.push(role);
			return role;
		},
		update: async ({ name, body }) => {
			const role = findMockRole({ roles, name });
			if (body.name) assertNameFree({ roles, name: body.name, except: role });
			Object.assign(role, body, { updated_at: Date.now() });
			return role;
		},
		remove: async ({ name }) => {
			const role = findMockRole({ roles, name });
			if (role.member_count > 0)
				rejectWith({
					status: 409,
					body: {
						code: "role_in_use",
						message: "Role is in use",
						details: { member_count: role.member_count },
					},
				});
			roles.splice(roles.indexOf(role), 1);
		},
	};
};
