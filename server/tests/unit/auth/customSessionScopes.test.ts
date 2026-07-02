import { describe, expect, test } from "bun:test";
import { checkScopes, Scopes } from "@autumn/shared";
import { getScopesForUserInOrg } from "@autumn/shared/utils/auth/getScopesForUserInOrg";

const state = { member: null as null | { role: string } };
const db = {
	query: { member: { findFirst: async () => state.member } },
} as never;

const resolve = () =>
	getScopesForUserInOrg({ db, userId: "u1", organizationId: "org_master" });
const canReachSandbox = (scopes: readonly string[]) =>
	checkScopes([Scopes.Platform.Write], scopes).allowed;

describe("getScopesForUserInOrg (transitive sandbox access foundation)", () => {
	test("a non-member gets no scopes and cannot reach sandboxes", async () => {
		state.member = null;
		const r = await resolve();
		expect(r.role).toBeNull();
		expect(r.scopes).toEqual([]);
		expect(canReachSandbox(r.scopes)).toBe(false);
	});

	for (const role of ["owner", "admin", "developer"]) {
		test(`a ${role} member can reach the org's sandboxes`, async () => {
			state.member = { role };
			const r = await resolve();
			expect(canReachSandbox(r.scopes)).toBe(true);
		});
	}

	for (const role of ["member", "sales"]) {
		test(`a ${role} member cannot reach the org's sandboxes`, async () => {
			state.member = { role };
			const r = await resolve();
			expect(canReachSandbox(r.scopes)).toBe(false);
		});
	}

	test("an unknown/legacy role gets no scopes", async () => {
		state.member = { role: "legacy_role" };
		const r = await resolve();
		expect(r.role).toBe("legacy_role");
		expect(r.scopes).toEqual([]);
		expect(canReachSandbox(r.scopes)).toBe(false);
	});
});
