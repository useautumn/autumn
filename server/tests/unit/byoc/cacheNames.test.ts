import { afterEach, describe, expect, test } from "bun:test";
import { AppEnv, type Organization } from "@autumn/shared";
import {
	cacheExternalId,
	cacheGroupLabel,
} from "@/internal/byoc/utils/byocCacheUtils.js";

const org = { id: "org_1", slug: "acme" } as Organization;
const env = AppEnv.Sandbox;

describe("cache deployment names", () => {
	const original = {
		NODE_ENV: process.env.NODE_ENV,
		ATOM_DEPLOYMENT_PREFIX: process.env.ATOM_DEPLOYMENT_PREFIX,
	};

	afterEach(() => {
		process.env.NODE_ENV = original.NODE_ENV;
		process.env.ATOM_DEPLOYMENT_PREFIX = original.ATOM_DEPLOYMENT_PREFIX;
	});

	test("a dev stack puts its own name in front, so two stacks can hold the same org", () => {
		process.env.NODE_ENV = "development";
		process.env.ATOM_DEPLOYMENT_PREFIX = "johnyeocx-wt5-john-atom";
		expect(cacheExternalId({ org, env })).toBe(
			"johnyeocx-wt5-john-atom.org_1.sandbox",
		);
		expect(cacheGroupLabel({ org, env })).toBe(
			"johnyeocx-wt5-john-atom-autumn-byoc-acme-sandbox",
		);
	});

	test("production ignores a prefix", () => {
		process.env.NODE_ENV = "production";
		process.env.ATOM_DEPLOYMENT_PREFIX = "johnyeocx-wt5-john-atom";
		expect(cacheExternalId({ org, env })).toBe("org_1.sandbox");
		expect(cacheGroupLabel({ org, env })).toBe("autumn-byoc-acme-sandbox");
	});

	test("development without a prefix names the org bare", () => {
		process.env.NODE_ENV = "development";
		delete process.env.ATOM_DEPLOYMENT_PREFIX;
		expect(cacheExternalId({ org, env })).toBe("org_1.sandbox");
		expect(cacheGroupLabel({ org, env })).toBe("autumn-byoc-acme-sandbox");
	});
});
