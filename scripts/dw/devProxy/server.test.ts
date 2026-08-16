import { afterAll, describe, expect, test } from "bun:test";
import { startDevProxy } from "./server.ts";

const api = Bun.serve({
	port: 0,
	fetch(req) {
		return new Response(`api:${new URL(req.url).pathname}`);
	},
});
const vite = Bun.serve({
	port: 0,
	fetch(req) {
		return new Response(`vite:${new URL(req.url).pathname}`);
	},
});
const proxy = startDevProxy({
	port: 0,
	ports: { api: api.port, checkout: 3001, vite: vite.port },
});

afterAll(() => {
	proxy.stop();
	api.stop();
	vite.stop();
});

const get = (path: string) => fetch(`http://127.0.0.1:${proxy.port}${path}`);

describe("dev-proxy", () => {
	test("routes SPA, API, MCP, and /backend through one port", async () => {
		expect(await (await get("/customers")).text()).toBe("vite:/customers");
		expect(await (await get("/v1/customers")).text()).toBe("api:/v1/customers");
		expect(await (await get("/mcp")).text()).toBe("api:/mcp");
		expect(await (await get("/backend/organization")).text()).toBe(
			"api:/organization",
		);
		expect(await (await get("/__dev-proxy")).text()).toBe("ok");
	});
});
