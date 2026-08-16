import { describe, expect, test } from "bun:test";
import { matchDevProxyRoute, originServiceUrls } from "./routes.ts";

const ports = { api: 8080, checkout: 3001, leaf: 3099, vite: 3000 };

const match = (pathname: string) => matchDevProxyRoute({ pathname, ports });

describe("matchDevProxyRoute", () => {
	test("maps the four public prefixes", () => {
		expect(match("/dashboard/customers")).toEqual({
			path: "/dashboard/customers",
			port: 3000,
			service: "vite",
		});
		expect(match("/api/v1/customers")).toEqual({
			path: "/v1/customers",
			port: 8080,
			service: "api",
		});
		expect(match("/leaf/mcp")).toEqual({
			path: "/mcp",
			port: 3099,
			service: "leaf",
		});
		expect(match("/checkout")).toEqual({
			path: "/checkout",
			port: 3001,
			service: "checkout",
		});
	});

	test("does not steal neighboring paths", () => {
		expect(match("/customers")).toBeNull();
		expect(match("/apiv2")).toBeNull();
	});
});

describe("originServiceUrls", () => {
	test("prints one path per service", () => {
		expect(originServiceUrls({ origin: "https://abc.ngrok.app" })).toEqual({
			api: "https://abc.ngrok.app/api",
			checkout: "https://abc.ngrok.app/checkout",
			dashboard: "https://abc.ngrok.app/dashboard",
			leaf: "https://abc.ngrok.app/leaf",
		});
	});
});
