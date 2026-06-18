import { describe, expect, test } from "bun:test";
import {
	getDefaultOrgPath,
	getOrgRouteRedirect,
	getSafeNextPath,
} from "@/utils/genUtils";

describe("getDefaultOrgPath", () => {
	test("defaults deployed orgs to production", () => {
		expect(getDefaultOrgPath({ deployed: true })).toBe(
			"/products?tab=products",
		);
	});

	test("defaults undeployed orgs to sandbox", () => {
		expect(getDefaultOrgPath({ deployed: false })).toBe(
			"/sandbox/products?tab=products",
		);
	});

	test("defaults missing orgs to sandbox", () => {
		expect(getDefaultOrgPath(null)).toBe("/sandbox/products?tab=products");
	});
});

describe("getSafeNextPath", () => {
	test("allows local absolute paths", () => {
		expect(getSafeNextPath(new URLSearchParams("next=/accept?id=inv_123"))).toBe(
			"/accept?id=inv_123",
		);
	});

	test("rejects external redirects", () => {
		expect(
			getSafeNextPath(new URLSearchParams("next=https://example.com")),
		).toBe("/");
		expect(getSafeNextPath(new URLSearchParams("next=//example.com"))).toBe(
			"/",
		);
	});
});

describe("getOrgRouteRedirect", () => {
	test("routes root to production for deployed orgs", () => {
		expect(getOrgRouteRedirect({ pathname: "/", deployed: true })).toBe(
			"/products?tab=products",
		);
	});

	test("preserves root search params on default redirects", () => {
		expect(
			getOrgRouteRedirect({
				pathname: "/",
				search: "?invite=inv_123",
				deployed: true,
			}),
		).toBe("/products?tab=products&invite=inv_123");
	});

	test("routes root to sandbox for undeployed orgs", () => {
		expect(getOrgRouteRedirect({ pathname: "/", deployed: false })).toBe(
			"/sandbox/products?tab=products",
		);
	});

	test("blocks live routes for undeployed orgs", () => {
		expect(
			getOrgRouteRedirect({
				pathname: "/products",
				search: "?tab=products",
				deployed: false,
			}),
		).toBe("/sandbox/products?tab=products");
	});

	test("allows sandbox routes for undeployed orgs", () => {
		expect(
			getOrgRouteRedirect({
				pathname: "/sandbox/products",
				search: "?tab=products",
				deployed: false,
			}),
		).toBeNull();
	});

	test("allows live routes for deployed orgs", () => {
		expect(
			getOrgRouteRedirect({
				pathname: "/products",
				search: "?tab=products",
				deployed: true,
			}),
		).toBeNull();
	});
});
