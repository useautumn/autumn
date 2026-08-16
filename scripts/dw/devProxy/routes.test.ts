import { describe, expect, test } from "bun:test";
import { matchDevProxyRoute } from "./routes.ts";

const ports = { api: 8080, vite: 3000, checkout: 3001 };

const match = (pathname: string) => matchDevProxyRoute({ pathname, ports });

describe("matchDevProxyRoute", () => {
	test("sends the SPA to vite", () => {
		expect(match("/")).toEqual({
			service: "vite",
			port: 3000,
			path: "/",
		});
		expect(match("/customers")).toEqual({
			service: "vite",
			port: 3000,
			path: "/customers",
		});
	});

	test("keeps public API / MCP / Slack / agent on the server", () => {
		expect(match("/v1/customers").service).toBe("api");
		expect(match("/mcp").path).toBe("/mcp");
		expect(match("/slack/events").port).toBe(8080);
		expect(match("/agent/chat").service).toBe("api");
		expect(match("/webhooks/connect/sandbox").service).toBe("api");
	});

	test("strips /backend so the dashboard can share one origin", () => {
		expect(match("/backend/organization")).toEqual({
			service: "api",
			port: 8080,
			path: "/organization",
		});
		expect(match("/backend")).toEqual({
			service: "api",
			port: 8080,
			path: "/",
		});
	});

	test("does not treat /backending as /backend", () => {
		expect(match("/backending").service).toBe("vite");
	});

	test("prefers the longest prefix", () => {
		expect(match("/slack-unfurl/events").path).toBe("/slack-unfurl/events");
		expect(match("/slack-unfurl/events").service).toBe("api");
	});
});
