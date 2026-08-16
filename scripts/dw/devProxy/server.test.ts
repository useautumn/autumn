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
const leaf = Bun.serve({
	port: 0,
	fetch(req) {
		return new Response(`leaf:${new URL(req.url).pathname}`);
	},
});
const checkout = Bun.serve({
	port: 0,
	fetch(req) {
		return new Response(`checkout:${new URL(req.url).pathname}`);
	},
});
const proxy = startDevProxy({
	port: 0,
	ports: {
		api: api.port,
		checkout: checkout.port,
		leaf: leaf.port,
		vite: vite.port,
	},
});

afterAll(() => {
	proxy.stop();
	api.stop();
	vite.stop();
	leaf.stop();
	checkout.stop();
});

const get = (path: string) =>
	fetch(`http://127.0.0.1:${proxy.port}${path}`, { redirect: "manual" });

describe("dev-proxy", () => {
	test("routes /dashboard /api /leaf /checkout", async () => {
		expect(await (await get("/dashboard/customers")).text()).toBe(
			"vite:/dashboard/customers",
		);
		expect(await (await get("/api/v1/customers")).text()).toBe(
			"api:/v1/customers",
		);
		expect(await (await get("/leaf/mcp")).text()).toBe("leaf:/mcp");
		expect(await (await get("/checkout")).text()).toBe("checkout:/checkout");
		expect((await get("/")).status).toBe(302);
		expect(await (await get("/__dev-proxy")).text()).toBe("ok");
	});
});
