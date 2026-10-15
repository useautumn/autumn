/**
 * getScopesForUserInOrg with custom roles (Track D, D4).
 *
 * Contract:
 * - A custom role's scopes come from its stored coarse access (write implies read).
 * - Built-in roles keep ROLE_SCOPES.
 * - An unknown role keeps its name and grants no scopes.
 * - Custom names that are Object prototype keys aren't mistaken for built-ins.
 * - A role must grant at least one resource (an empty scope set would fail open).
 */

import { describe, expect, test } from "bun:test";
import {
	RESOURCES,
	ROLE_SCOPES,
	type RoleAccessMap,
	RoleAccessMapSchema,
	roleAccessToScopes,
	scopesToRoleAccess,
} from "@autumn/shared";
import { getScopesForUserInOrg } from "@autumn/shared/utils/auth/getScopesForUserInOrg";

type ResolverDb = Parameters<typeof getScopesForUserInOrg>[0]["db"];

const noAccess = Object.fromEntries(
	RESOURCES.map((resource) => [resource, "none"]),
) as RoleAccessMap;

const supportAccess: RoleAccessMap = {
	...noAccess,
	customers: "write",
	billing: "read",
};

const fakeDb = ({
	role,
	customRole,
}: {
	role: string;
	customRole?: { access: RoleAccessMap };
}) =>
	({
		query: {
			member: { findFirst: async () => ({ role }) },
			organizationRole: { findFirst: async () => customRole },
		},
	}) as unknown as ResolverDb;

const resolve = (db: ResolverDb) =>
	getScopesForUserInOrg({ db, userId: "usr_1", organizationId: "org_1" });

describe("getScopesForUserInOrg: custom roles", () => {
	test("a custom role grants the scopes of its stored access", async () => {
		const result = await resolve(
			fakeDb({ role: "support", customRole: { access: supportAccess } }),
		);

		expect(result).toEqual({
			role: "support",
			scopes: ["customers:write", "billing:read"],
		});
	});

	test("built-in roles keep ROLE_SCOPES and unknown roles grant nothing", async () => {
		expect(await resolve(fakeDb({ role: "sales" }))).toEqual({
			role: "sales",
			scopes: ROLE_SCOPES.sales,
		});
		expect(await resolve(fakeDb({ role: "ghost" }))).toEqual({
			role: "ghost",
			scopes: [],
		});
	});

	test("a custom role named like an Object prototype key is not built-in", async () => {
		expect(
			await resolve(
				fakeDb({ role: "constructor", customRole: { access: supportAccess } }),
			),
		).toEqual({
			role: "constructor",
			scopes: ["customers:write", "billing:read"],
		});
	});

	test("a role must grant at least one resource", () => {
		expect(RoleAccessMapSchema.safeParse(noAccess).success).toBe(false);
		expect(RoleAccessMapSchema.safeParse(supportAccess).success).toBe(true);
	});

	test("access and scopes convert both ways for every built-in role", () => {
		for (const scopes of Object.values(ROLE_SCOPES)) {
			const access = scopesToRoleAccess({ scopes });
			expect(
				scopesToRoleAccess({ scopes: roleAccessToScopes({ access }) }),
			).toEqual(access);
		}
		expect(scopesToRoleAccess({ scopes: ROLE_SCOPES.admin }).analytics).toBe(
			"read",
		);
		expect(scopesToRoleAccess({ scopes: ROLE_SCOPES.admin }).billing).toBe(
			"write",
		);
	});
});
