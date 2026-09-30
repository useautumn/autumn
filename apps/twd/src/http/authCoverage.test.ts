import { describe, expect, test } from "bun:test";

process.env.TWD_DATABASE_URL ??= "postgres://unused@localhost:1/unused";
process.env.TWD_PUBLIC_URL = "http://localhost:4100";

const { createApp } = await import("./createApp.ts");

/** Routes a caller may reach with no session or API key; each checks its own credential. */
const PUBLIC_ROUTES = new Set([
	"GET /health",
	"GET /auth/google",
	"GET /auth/google/callback",
	"POST /auth/logout",
	"POST /webhooks/github",
	"POST /ingress/map",
	"POST /ingress/connect/:env",
	"GET /*",
]);

const concrete = (path: string) =>
	path.replace(/:(\w+)(\{[^}]*\})?/g, "x").replace(/\*$/, "anything");

describe("every twd route without credentials", () => {
	const app = createApp();
	const routes = app.routes.filter((r) => r.method !== "ALL");

	test("the route table is not empty", () => {
		expect(routes.length).toBeGreaterThan(40);
	});

	for (const { method, path } of routes) {
		const bare = path.replace(/^\/api(?=\/|$)/, "") || "/";
		if (PUBLIC_ROUTES.has(`${method} ${bare}`)) continue;
		test(`${method} ${path} → 401`, async () => {
			const res = await app.request(concrete(path), { method });
			expect(res.status).toBe(401);
		});
	}
});
