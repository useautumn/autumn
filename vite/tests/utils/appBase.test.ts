import { describe, expect, test } from "bun:test";
import { appHref, appOriginHref, stripAppBase } from "@/utils/appBase";

const dashboardBase = "/dashboard/";

describe("appBase helpers", () => {
	test("public base prefixes hard navigations", () => {
		expect(appHref("/", dashboardBase)).toBe("/dashboard/");
		expect(appHref("/sign-in", dashboardBase)).toBe("/dashboard/sign-in");
		expect(appHref("https://example.com", dashboardBase)).toBe(
			"https://example.com",
		);
		expect(appHref("/dashboard/sign-in", dashboardBase)).toBe(
			"/dashboard/sign-in",
		);
	});

	test("public base is stripped from window pathnames", () => {
		expect(stripAppBase("/dashboard", dashboardBase)).toBe("/");
		expect(stripAppBase("/dashboard/products", dashboardBase)).toBe(
			"/products",
		);
		expect(stripAppBase("/dashboard/sandbox/products", dashboardBase)).toBe(
			"/sandbox/products",
		);
	});

	test("root base is a no-op", () => {
		expect(appHref("/sign-in", "/")).toBe("/sign-in");
		expect(stripAppBase("/products", "/")).toBe("/products");
	});

	test("appOriginHref uses the page origin", () => {
		expect(
			appOriginHref("/sign-in", dashboardBase, "https://abc.ngrok.app"),
		).toBe("https://abc.ngrok.app/dashboard/sign-in");
		expect(appOriginHref("/close", "/", "http://localhost:3000")).toBe(
			"http://localhost:3000/close",
		);
	});
});
