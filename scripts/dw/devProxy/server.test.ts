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
	test("routes /dashboard /backend /leaf /checkout", async () => {
		expect(await (await get("/dashboard/")).text()).toBe("vite:/dashboard/");
		expect(await (await get("/dashboard/customers")).text()).toBe(
			"vite:/dashboard/customers",
		);
		expect(await (await get("/backend/v1/customers")).text()).toBe(
			"api:/v1/customers",
		);
		expect(await (await get("/backend/api/auth/get-session")).text()).toBe(
			"api:/api/auth/get-session",
		);
		expect(await (await get("/leaf/mcp")).text()).toBe("leaf:/mcp");
		expect((await get("/checkout")).status).toBe(302);
		expect((await get("/checkout")).headers.get("location")).toBe(
			`http://127.0.0.1:${proxy.port}/checkout/`,
		);
		expect(await (await get("/checkout/")).text()).toBe("checkout:/checkout/");
		expect((await get("/")).status).toBe(302);
		expect((await get("/")).headers.get("location")).toBe(
			`http://127.0.0.1:${proxy.port}/dashboard/`,
		);
		expect((await get("/dashboard")).status).toBe(302);
		expect((await get("/dashboard")).headers.get("location")).toBe(
			`http://127.0.0.1:${proxy.port}/dashboard/`,
		);
		expect(await (await get("/__dev-proxy")).text()).toBe("ok");
	});
});
