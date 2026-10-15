import { describe, expect, test } from "bun:test";
import { RESOURCES, type ScopeString } from "@autumn/shared";
import {
	accessToScopes,
	canEditRole,
	emptyAccess,
	formValuesToRoleBody,
	type Role,
	type RoleAccessRecord,
	roleToFormValues,
	scopesToAccess,
	summarizeAccess,
	summarizeRules,
} from "@/views/settings/sections/roles/roleAccess";

const access = (overrides: Partial<RoleAccessRecord>): RoleAccessRecord => ({
	...emptyAccess(),
	...overrides,
});

const role = (overrides: Partial<Role>): Role => ({
	name: "support",
	label: "Support",
	built_in: false,
	access: access({ balances: "write" }),
	member_count: 0,
	rule_count: 0,
	created_at: 1,
	updated_at: 1,
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
		const body = formValuesToRoleBody({
			values: { label: "Ops", access: access({ analytics: "write" }) },
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
		{ label: "Support", name: "support" },
		{ label: "  Finance team ", name: "finance_team" },
		{ label: "R&D ops", name: "rd_ops" },
	])("label '$label' → name '$name'", ({ label, name }) => {
		const body = formValuesToRoleBody({
			values: { label, access: emptyAccess() },
		});
		expect(body).toEqual({ name, label: label.trim(), access: emptyAccess() });
	});

	test("an existing role seeds the form and round-trips", () => {
		const existing = role({ access: access({ customers: "write" }) });
		const values = roleToFormValues({ role: existing });
		expect(values).toEqual({ label: "Support", access: existing.access });
		expect(formValuesToRoleBody({ values })).toEqual({
			name: existing.name,
			label: existing.label,
			access: existing.access,
		});
	});

	test("a new role starts with no access", () => {
		expect(roleToFormValues({ role: null })).toEqual({
			label: "",
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
		{ name: "owner", rule_count: 0, summary: "Skips rules" },
		{ name: "admin", rule_count: 3, summary: "Skips rules" },
		{ name: "support", rule_count: 0, summary: "No rules" },
		{ name: "support", rule_count: 1, summary: "1 rule" },
		{ name: "sales", rule_count: 2, summary: "2 rules" },
	])("$name with $rule_count → $summary", ({ name, rule_count, summary }) => {
		expect(summarizeRules({ role: role({ name, rule_count }) })).toBe(summary);
	});
});
