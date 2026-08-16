import { describe, expect, test } from "bun:test";
import { matchDevProxyRoute, originServiceUrls } from "./routes.ts";

const ports = {
	api: 8080,
	checkout: 3001,
	emulate: 4000,
	leaf: 3099,
	vite: 3000,
};

const match = (pathname: string) => matchDevProxyRoute({ pathname, ports });

describe("matchDevProxyRoute", () => {
	test("strips public folders and sends the rest to Vite", () => {
		expect(match("/sign-in")).toEqual({
			path: "/sign-in",
			port: 3000,
			service: "vite",
		});
		expect(match("/backend/v1/customers")).toEqual({
			path: "/v1/customers",
			port: 8080,
			service: "api",
		});
		expect(match("/backend/api/auth/get-session")).toEqual({
			path: "/api/auth/get-session",
			port: 8080,
			service: "api",
		});
		expect(match("/leaf/mcp")).toEqual({
			path: "/mcp",
			port: 3099,
			service: "leaf",
		});
		expect(match("/checkout")).toEqual({
			path: "/",
			port: 3001,
			service: "checkout",
		});
		expect(match("/checkout/c/abc")).toEqual({
			path: "/c/abc",
			port: 3001,
			service: "checkout",
		});
		expect(match("/emulate/o/oauth2/v2/auth")).toEqual({
			path: "/o/oauth2/v2/auth",
			port: 4000,
			service: "emulate",
		});
	});

	test("sends Vite root assets to dashboard, or checkout by Referer", () => {
		expect(match("/src/main.tsx")).toEqual({
			path: "/src/main.tsx",
			port: 3000,
			service: "vite",
		});
		expect(
			matchDevProxyRoute({
				pathname: "/@vite/client",
				ports,
				referer: "https://abc.ngrok.app/checkout/",
			}),
		).toEqual({
			path: "/@vite/client",
			port: 3001,
			service: "checkout",
		});
	});
});

describe("originServiceUrls", () => {
	test("dashboard is the origin; others are folders", () => {
		expect(originServiceUrls({ origin: "https://abc.ngrok.app" })).toEqual({
			api: "https://abc.ngrok.app/backend",
			checkout: "https://abc.ngrok.app/checkout",
			dashboard: "https://abc.ngrok.app",
			emulate: "https://abc.ngrok.app/emulate",
			leaf: "https://abc.ngrok.app/leaf",
		});
	});
});
