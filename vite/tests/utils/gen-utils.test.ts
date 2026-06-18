import { describe, expect, test } from "bun:test";
import { getDefaultOrgPath, getOrgRouteRedirect } from "@/utils/genUtils";

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

describe("getOrgRouteRedirect", () => {
	test("routes root to production for deployed orgs", () => {
		expect(getOrgRouteRedirect({ pathname: "/", deployed: true })).toBe(
			"/products?tab=products",
		);
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
