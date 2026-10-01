import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { resolveRouteTemplate } from "@/honoMiddlewares/utils/resolveRouteTemplate.js";

/** Mirrors the server: a global "*" middleware in front of a router mounted under /v1. */
const resolveFor = async ({
	method = "GET",
	path,
}: {
	method?: string;
	path: string;
}) => {
	let resolved: string | undefined;
	const app = new Hono();
	app.use("*", async (c, next) => {
		resolved = resolveRouteTemplate({ c });
		await next();
	});
	const router = new Hono();
	router.get("/customers/:customer_id/invoices/:invoice_id/metadata", (c) =>
		c.text("ok"),
	);
	router.post("/attach", (c) => c.text("ok"));
	app.route("/v1", router);

	await app.request(path, { method });
	return resolved;
};

describe("resolveRouteTemplate", () => {
	test("returns the matched route's template, not its ids", async () => {
		expect(
			await resolveFor({ path: "/v1/customers/cus_1/invoices/in_1/metadata" }),
		).toBe("/v1/customers/:customer_id/invoices/:invoice_id/metadata");
	});

	test("keeps a param-free route as-is", async () => {
		expect(await resolveFor({ method: "POST", path: "/v1/attach" })).toBe(
			"/v1/attach",
		);
	});

	test("falls back to the concrete path when only the wildcard middleware matched", async () => {
		expect(await resolveFor({ path: "/v1/unknown/thing" })).toBe(
			"/v1/unknown/thing",
		);
	});
});
