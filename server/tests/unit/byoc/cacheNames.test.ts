import { afterEach, describe, expect, test } from "bun:test";
import { AppEnv, type Organization } from "@autumn/shared";
import {
	cacheExternalId,
	cacheGroupLabel,
	cacheNames,
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
