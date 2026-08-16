import { describe, expect, test } from "bun:test";
import { appHref, appOriginHref, stripAppBase } from "@/utils/appBase";

const proxyBase = "/dashboard/";

describe("appBase helpers", () => {
	test("path-proxy base prefixes hard navigations", () => {
		expect(appHref("/", proxyBase)).toBe("/dashboard/");
		expect(appHref("/sign-in", proxyBase)).toBe("/dashboard/sign-in");
		expect(appHref("https://example.com", proxyBase)).toBe(
			"https://example.com",
		);
		expect(appHref("/api/auth/ok", proxyBase)).toBe("/api/auth/ok");
		expect(appHref("/backend/v1/customers", proxyBase)).toBe(
			"/backend/v1/customers",
		);
		expect(appHref("/dashboard/sign-in", proxyBase)).toBe("/dashboard/sign-in");
	});

	test("path-proxy base is stripped from window pathnames", () => {
		expect(stripAppBase("/dashboard", proxyBase)).toBe("/");
		expect(stripAppBase("/dashboard/products", proxyBase)).toBe("/products");
		expect(stripAppBase("/dashboard/sandbox/products", proxyBase)).toBe(
			"/sandbox/products",
		);
	});

	test("root base is a no-op", () => {
		expect(appHref("/sign-in", "/")).toBe("/sign-in");
		expect(stripAppBase("/products", "/")).toBe("/products");
	});

	test("appOriginHref uses the page origin", () => {
		expect(appOriginHref("/sign-in", proxyBase, "https://abc.ngrok.app")).toBe(
			"https://abc.ngrok.app/dashboard/sign-in",
		);
		expect(appOriginHref("/close", "/", "http://localhost:3000")).toBe(
			"http://localhost:3000/close",
		);
	});
});
