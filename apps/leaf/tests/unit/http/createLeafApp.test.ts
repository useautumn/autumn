import { describe, expect, test } from "bun:test";
import { createLeafApp } from "../../../src/http/createLeafApp.js";

const app = createLeafApp();

describe("Leaf HTTP app", () => {
	test("serves health and credentialed CORS preflights", async () => {
		const health = await app.request("/health");
		expect(health.status).toBe(200);
		expect(await health.json()).toEqual({ ok: true });
		expect(health.headers.get("access-control-allow-origin")).toBe("*");

		const preflight = await app.request("/agent/chat", {
			headers: {
				"access-control-request-headers": "content-type, app_env",
				origin: "https://app.useautumn.com",
			},
			method: "OPTIONS",
		});
		expect(preflight.status).toBe(204);
		expect(preflight.headers.get("access-control-allow-origin")).toBe(
			"https://app.useautumn.com",
		);
		expect(preflight.headers.get("access-control-allow-credentials")).toBe(
			"true",
		);
		expect(preflight.headers.get("access-control-allow-headers")).toBe(
			"content-type, app_env",
		);
	});

	test("authenticates registered web routes without guarding unknown paths", async () => {
		const registered = await app.request("/agent/chat", { method: "POST" });
		expect(registered.status).toBe(401);
		expect(await registered.json()).toEqual({ error: "Not authenticated" });

		const unknown = await app.request("/agent/not-a-route");
		expect(unknown.status).toBe(404);
	});
});
