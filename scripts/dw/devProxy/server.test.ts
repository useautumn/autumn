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
const emulate = Bun.serve({
	port: 0,
	fetch(req) {
		return new Response(`emulate:${new URL(req.url).pathname}`);
	},
});
const proxy = startDevProxy({
	port: 0,
	ports: {
		api: api.port,
		checkout: checkout.port,
		emulate: emulate.port,
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
	emulate.stop();
});

const get = (path: string) =>
	fetch(`http://127.0.0.1:${proxy.port}${path}`, { redirect: "manual" });

describe("dev-proxy", () => {
	test("serves the dashboard at / and strips /backend /checkout /emulate", async () => {
		expect(await (await get("/")).text()).toBe("vite:/");
		expect(await (await get("/sign-in")).text()).toBe("vite:/sign-in");
		expect((await get("/dashboard")).status).toBe(302);
		expect((await get("/dashboard")).headers.get("location")).toBe(
			`http://127.0.0.1:${proxy.port}/`,
		);
		expect((await get("/dashboard/customers")).headers.get("location")).toBe(
			`http://127.0.0.1:${proxy.port}/customers`,
		);
		expect(await (await get("/backend/v1/customers")).text()).toBe(
			"api:/v1/customers",
		);
		expect(await (await get("/backend/api/auth/get-session")).text()).toBe(
			"api:/api/auth/get-session",
		);
		expect(await (await get("/leaf/mcp")).text()).toBe("leaf:/mcp");
		expect(await (await get("/emulate/o/oauth2/v2/auth")).text()).toBe(
			"emulate:/o/oauth2/v2/auth",
		);
		expect((await get("/checkout")).status).toBe(302);
		expect((await get("/checkout")).headers.get("location")).toBe(
			`http://127.0.0.1:${proxy.port}/checkout/`,
		);
		expect(await (await get("/checkout/")).text()).toBe("checkout:/");
		expect(await (await get("/__dev-proxy")).text()).toBe("ok");
		expect(await (await get("/src/main.tsx")).text()).toBe("vite:/src/main.tsx");
		expect(
			await (
				await fetch(`http://127.0.0.1:${proxy.port}/@vite/client`, {
					headers: { referer: `http://127.0.0.1:${proxy.port}/checkout/` },
				})
			).text(),
		).toBe("checkout:/@vite/client");
	});
});
