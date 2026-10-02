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
		for (const prefix of [undefined, "johnyeocx-wt5-john-atom"]) {
			if (prefix) process.env.ATOM_DEPLOYMENT_PREFIX = prefix;
			else delete process.env.ATOM_DEPLOYMENT_PREFIX;
			const shadow = shadowAtomCacheNames({ env });
			for (const lookalike of [
				"shadow-atom-sandbox",
				"shadow-atom",
				"autumn-shadow-atom",
				"autumn-internal:shadow-atom",
				"autumn-internal:shadow-atom:sandbox",
			]) {
				const names = cacheNames({
					org: { id: lookalike, slug: lookalike } as Organization,
					env,
				});
				expect(names.externalId).not.toBe(shadow.externalId);
				expect(names.label).not.toBe(shadow.label);
			}
		}
		delete process.env.ATOM_DEPLOYMENT_PREFIX;
		expect(shadowAtomCacheNames({ env })).toEqual({
			externalId: "autumn-internal:shadow-atom:sandbox",
			label: "autumn-internal-shadow-atom-sandbox",
		});
	});
});
