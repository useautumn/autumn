import { afterEach, describe, expect, test } from "bun:test";
import { AppEnv, type Organization } from "@autumn/shared";
import {
	cacheExternalId,
	cacheGroupLabel,
	cacheNames,
	cacheStackName,
	cacheStackNameSuffix,
	shadowAtomCacheNames,
} from "@/internal/byoc/utils/byocCacheUtils.js";

const org = { id: "org_1", slug: "acme" } as Organization;
const env = AppEnv.Sandbox;

describe("cache deployment names", () => {
	const originalPrefix = process.env.ATOM_DEPLOYMENT_PREFIX;

	afterEach(() => {
		process.env.ATOM_DEPLOYMENT_PREFIX = originalPrefix;
	});

	test("a dev stack puts its own name in front, so two stacks can hold the same org", () => {
		process.env.ATOM_DEPLOYMENT_PREFIX = "johnyeocx-wt5-john-atom";
		expect(cacheExternalId({ org, env })).toBe(
			"johnyeocx-wt5-john-atom.org_1.sandbox",
		);
		expect(cacheGroupLabel({ org, env })).toBe(
			"johnyeocx-wt5-john-atom-autumn-byoc-acme-sandbox",
		);
	});

	test("a blank prefix counts as none", () => {
		process.env.ATOM_DEPLOYMENT_PREFIX = "  ";
		expect(cacheExternalId({ org, env })).toBe("org_1.sandbox");
		expect(cacheGroupLabel({ org, env })).toBe("autumn-byoc-acme-sandbox");
	});

	test("without a prefix the org is named bare", () => {
		delete process.env.ATOM_DEPLOYMENT_PREFIX;
		expect(cacheExternalId({ org, env })).toBe("org_1.sandbox");
		expect(cacheGroupLabel({ org, env })).toBe("autumn-byoc-acme-sandbox");
	});

	test("a stack is named atom-<slug>-<env> or the chosen base, then a suffix from its external id", () => {
		delete process.env.ATOM_DEPLOYMENT_PREFIX;
		const suffix = cacheStackNameSuffix({ org, env });
		expect(suffix).toMatch(/^[0-9a-f]{6}$/);
		expect(cacheStackName({ org, env })).toBe(`atom-acme-sandbox-${suffix}`);
		expect(cacheStackName({ org, env, base: "acme-atom" })).toBe(
			`acme-atom-${suffix}`,
		);
		expect(cacheNames({ org, env, stackName: "acme-atom-abc123" })).toEqual({
			externalId: "org_1.sandbox",
			label: "acme-atom-abc123",
		});
	});

	test("the suffix differs per env and per dev stack, and leaves the branch out of the name", () => {
		delete process.env.ATOM_DEPLOYMENT_PREFIX;
		const sandbox = cacheStackNameSuffix({ org, env: AppEnv.Sandbox });
		expect(cacheStackNameSuffix({ org, env: AppEnv.Live })).not.toBe(sandbox);
		process.env.ATOM_DEPLOYMENT_PREFIX = "john-atom-setup-ui";
		expect(cacheStackNameSuffix({ org, env })).not.toBe(sandbox);
		expect(cacheStackName({ org, env })).not.toContain("john");
	});

	test("an org named to look like our shadow Atom still gets its own deployment group", () => {
		for (const prefix of [undefined, "capy-admin-shadow-atom-tab"]) {
			if (prefix) process.env.ATOM_DEPLOYMENT_PREFIX = prefix;
			else delete process.env.ATOM_DEPLOYMENT_PREFIX;
			const shadow = shadowAtomCacheNames();
			for (const lookalike of [
				"autumn-internal-shadow-atom",
				"shadow-atom",
				"autumn-shadow-atom",
			])
				for (const orgEnv of [AppEnv.Sandbox, AppEnv.Live]) {
					const names = cacheNames({
						org: { id: lookalike, slug: lookalike } as Organization,
						env: orgEnv,
					});
					expect(names.externalId).not.toBe(shadow.externalId);
					expect(names.label).not.toBe(shadow.label);
				}
		}
		delete process.env.ATOM_DEPLOYMENT_PREFIX;
		expect(shadowAtomCacheNames()).toEqual({
			externalId: "autumn-internal-shadow-atom",
			label: "autumn-internal-shadow-atom",
		});
	});

	test("every external id we build is one alien accepts, with or without a dev prefix", () => {
		const alienExternalId = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;
		for (const prefix of [undefined, "capy-admin-shadow-atom-tab"]) {
			if (prefix) process.env.ATOM_DEPLOYMENT_PREFIX = prefix;
			else delete process.env.ATOM_DEPLOYMENT_PREFIX;
			expect(shadowAtomCacheNames().externalId).toMatch(alienExternalId);
			expect(cacheNames({ org, env }).externalId).toMatch(alienExternalId);
		}
	});

	test("an external id alien would reject fails before it reaches alien", () => {
		delete process.env.ATOM_DEPLOYMENT_PREFIX;
		expect(() =>
			cacheExternalId({
				org: { id: "org:with:colons" } as Organization,
				env,
			}),
		).toThrow("not a valid alien external id");
	});
});
