import { afterEach, describe, expect, test } from "bun:test";
import { AppEnv, type Organization } from "@autumn/shared";
import {
	cacheExternalId,
	cacheGroupLabel,
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
});
