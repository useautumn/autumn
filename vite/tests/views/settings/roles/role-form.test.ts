import { describe, expect, test } from "bun:test";
import { RESOURCES, type ScopeString } from "@autumn/shared";
import { AxiosError, AxiosHeaders } from "axios";
import {
	type ApiRole,
	accessError,
	accessToScopes,
	canEditRole,
	emptyAccess,
	formValuesToCreateBody,
	formValuesToUpdateBody,
	memberRoleOptions,
	nameToRoleId,
	type RoleAccessRecord,
	roleName,
	roleToFormValues,
	scopesToAccess,
	summarizeAccess,
	summarizeRules,
} from "@/views/settings/sections/roles/roleAccess";
import { getRoleInUseCount } from "@/views/settings/sections/roles/roleErrors";

// Role id pattern from the D4 roles contract.
const ROLE_ID = /^[a-z0-9][a-z0-9_-]{0,62}$/;

const access = (overrides: Partial<RoleAccessRecord>): RoleAccessRecord => ({
	...emptyAccess(),
	...overrides,
});

const role = (overrides: Partial<ApiRole>): ApiRole => ({
	id: "support",
	name: "Support",
	built_in: false,
	access: access({ balances: "write" }),
	member_count: 0,
	rule_count: 0,
	...overrides,
});

describe("access grid ⇄ access record", () => {
	const cases: {
		name: string;
		access: RoleAccessRecord;
		scopes: ScopeString[];
	}[] = [
		{ name: "no access", access: emptyAccess(), scopes: [] },
		{
			name: "read one resource",
			access: access({ customers: "read" }),
			scopes: ["customers:read"],
		},
		{
			name: "write implies only the write scope",
			access: access({ customers: "write", balances: "write" }),
			scopes: ["customers:write", "balances:write"],
		},
		{
			name: "mixed read, write and analytics read",
			access: access({
				plans: "read",
				billing: "write",
				analytics: "read",
			}),
			scopes: ["plans:read", "billing:write", "analytics:read"],
		},
	];

	test.each(cases)("$name", ({ access, scopes }) => {
		expect(accessToScopes({ access }).sort()).toEqual([...scopes].sort());
		expect(scopesToAccess({ scopes })).toEqual(access);
	});
});

describe("analytics is capped at read", () => {
	test("a write in the record becomes a read scope", () => {
		expect(accessToScopes({ access: access({ analytics: "write" }) })).toEqual([
			"analytics:read",
		]);
	});

	test("a stray write scope becomes read in the record", () => {
		const scopes = ["analytics:write"] as unknown as ScopeString[];
		expect(scopesToAccess({ scopes }).analytics).toBe("read");
	});

	test("a role body never carries analytics write", () => {
		const body = formValuesToCreateBody({
			values: { name: "Ops", access: access({ analytics: "write" }) },
		});
		expect(body.access.analytics).toBe("read");
	});
});

describe("built-in roles are read-only", () => {
	test.each([
		{ built_in: true, editable: false },
		{ built_in: false, editable: true },
	])("built_in: $built_in → editable: $editable", ({ built_in, editable }) => {
		expect(canEditRole({ role: role({ built_in }) })).toBe(editable);
	});
});

describe("form values ⇄ role", () => {
	test.each([
		{ name: "Support", id: "support" },
		{ name: "  Finance team ", id: "finance_team" },
		{ name: "R&D ops", id: "rd_ops" },
		{ name: "_ops team", id: "ops_team" },
		{ name: "a".repeat(80), id: "a".repeat(63) },
	])("name '$name' → id '$id'", ({ name, id }) => {
		expect(id).toMatch(ROLE_ID);
		expect(nameToRoleId({ name })).toBe(id);
		expect(
			formValuesToCreateBody({ values: { name, access: emptyAccess() } }),
		).toEqual({ id, name: name.trim(), access: emptyAccess() });
	});

	test("an update sends the current id and leaves it alone", () => {
		const roleAccess = access({ balances: "write" });
		const existing = role({
			id: "support",
			name: "Support",
			access: roleAccess,
		});
		const values = { name: "Customer support", access: roleAccess };
		expect(formValuesToUpdateBody({ role: existing, values })).toEqual({
			id: "support",
			name: "Customer support",
			access: roleAccess,
		});
	});

	test("an existing role seeds the form", () => {
		const roleAccess = access({ customers: "write" });
		expect(roleToFormValues({ role: role({ access: roleAccess }) })).toEqual({
			name: "Support",
			access: roleAccess,
		});
	});

	test.each([
		{ value: emptyAccess(), error: "Choose access to at least one resource" },
		{ value: access({ analytics: "read" }), error: undefined },
	])("access error: $error", ({ value, error }) => {
		expect(accessError({ access: value })).toBe(error);
	});

	test("a new role starts with no access", () => {
		expect(roleToFormValues({ role: null })).toEqual({
			name: "",
			access: emptyAccess(),
		});
	});
});

describe("access summary", () => {
	test.each([
		{ value: emptyAccess(), summary: "No access" },
		{ value: access({ customers: "read" }), summary: "Read only" },
		{
			value: access({ customers: "write", apiKeys: "write" }),
			summary: "Write customers, API keys",
		},
		{
			value: access({
				customers: "write",
				features: "write",
				plans: "write",
				rewards: "write",
				balances: "write",
			}),
			summary: "Write customers, features, plans +2 more",
		},
		{
			value: scopesToAccess({
				scopes: RESOURCES.map((r) => `${r}:write` as ScopeString),
			}),
			summary: "Full access",
		},
	])("$summary", ({ value, summary }) => {
		expect(summarizeAccess({ access: value })).toBe(summary);
	});
});

describe("approval rules column", () => {
	test.each([
		{ id: "owner", rule_count: 0, summary: "No rules" },
		{ id: "admin", rule_count: 3, summary: "3 rules" },
		{ id: "support", rule_count: 1, summary: "1 rule" },
		{ id: "sales", rule_count: 2, summary: "2 rules" },
	])("$id with $rule_count → $summary", ({ id, rule_count, summary }) => {
		expect(summarizeRules({ role: role({ id, rule_count }) })).toBe(summary);
	});
});

describe("delete errors", () => {
	const httpError = (data: unknown) =>
		new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
			status: 409,
			statusText: "Conflict",
			data,
			headers: {},
			config: { headers: new AxiosHeaders() },
		});

	test.each([
		{
			case: "role_in_use with details.member_count",
			error: httpError({ code: "role_in_use", details: { member_count: 4 } }),
			count: 4,
		},
		{
			case: "another conflict",
			error: httpError({ code: "role_exists" }),
			count: null,
		},
		{ case: "not an HTTP error", error: new Error("boom"), count: null },
	])("$case → $count", ({ error, count }) => {
		expect(getRoleInUseCount({ error })).toBe(count);
	});
});

describe("member role select", () => {
	const roles = [
		role({ id: "owner", name: "Owner", built_in: true }),
		role({ id: "admin", name: "Admin", built_in: true }),
		role({ id: "key_accounts", name: "Key accounts" }),
	];

	test.each([
		{ roleId: "owner", name: "Owner" },
		{ roleId: "key_accounts", name: "Key accounts" },
		{ roleId: "deleted_role", name: "deleted_role" },
	])("$roleId shows '$name'", ({ roleId, name }) => {
		expect(roleName({ roles, roleId })).toBe(name);
	});

	test.each([
		{ allowOwner: true, options: ["owner", "admin", "key_accounts"] },
		{ allowOwner: false, options: ["admin", "key_accounts"] },
	])("allowOwner: $allowOwner lists $options", ({ allowOwner, options }) => {
		const result = memberRoleOptions({ roles, allowOwner });
		expect(result.map((option) => option.value)).toEqual([...options]);
		expect(result.find((o) => o.value === "key_accounts")?.label).toBe(
			"Key accounts",
		);
	});
});
