import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import { RecaseError, Scopes } from "@autumn/shared";
import { Hono } from "hono";
import { z } from "zod/v4";
import * as initAxiomModule from "@/external/axiom/initAxiom.js";
import * as queryAxiomModule from "@/external/axiom/queryAxiom.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleGetAdminShadowAtomResults } from "@/internal/admin/handleGetAdminShadowAtomResults.js";

const configured = spyOn(initAxiomModule, "isAxiomConfigured").mockReturnValue(
	true,
);
const query = spyOn(queryAxiomModule, "queryAxiomTabular").mockResolvedValue([
	{
		org_id: "org_a",
		checks: 1000,
		matches: 980,
		mismatches: 10,
		timeouts: 6,
		errors: 4,
		p50_ms: 3.4,
		p99_ms: "41",
	},
	{
		org_id: "org_b",
		checks: 5,
		matches: 0,
		mismatches: 0,
		timeouts: 5,
		errors: 0,
		p50_ms: 300,
		p99_ms: 301,
	},
]);

afterEach(() => {
	configured.mockReturnValue(true);
	query.mockClear();
});
afterAll(() => {
	configured.mockRestore();
	query.mockRestore();
});

const fetchResults = ({
	path,
	scopes = [Scopes.Superuser],
}: {
	path: string;
	scopes?: string[];
}) => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", { scopes } as HonoEnv["Variables"]["ctx"]);
		await next();
	});
	app.onError(
		(error) =>
			new Response(error.message, {
				status:
					error instanceof RecaseError
						? error.statusCode
						: error instanceof z.ZodError
							? 400
							: 500,
			}),
	);
	app.get(
		"/admin/shadow-atom-config/:env/results",
		...handleGetAdminShadowAtomResults,
	);
	return app.request(path);
};

test("staff read match rate and latency per org from the env's atom_shadow_check lines", async () => {
	const response = await fetchResults({
		path: "/admin/shadow-atom-config/live/results?range=24h",
	});

	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({
		available: true,
		range: "24h",
		orgs: [
			{
				org_id: "org_a",
				checks: 1000,
				matches: 980,
				mismatches: 10,
				timeouts: 6,
				errors: 4,
				match_rate: 980 / 990,
				p50_ms: 3.4,
				p99_ms: 41,
			},
			{
				org_id: "org_b",
				checks: 5,
				matches: 0,
				mismatches: 0,
				timeouts: 5,
				errors: 0,
				match_rate: null,
				p50_ms: 300,
				p99_ms: 301,
			},
		],
	});
	const [{ apl, options }] = query.mock.calls[0] ?? [];
	expect(apl).toContain("type == 'atom_shadow_check'");
	expect(apl).toContain("env == 'live'");
	expect(apl).toContain("by org_id");
	expect(options).toEqual({ startTime: "now-24h", endTime: "now" });
});

test("the window defaults to the last hour", async () => {
	await fetchResults({ path: "/admin/shadow-atom-config/sandbox/results" });

	expect(query.mock.calls[0]?.[0].options?.startTime).toBe("now-1h");
});

test("a server without Axiom says so instead of failing", async () => {
	configured.mockReturnValue(false);

	const response = await fetchResults({
		path: "/admin/shadow-atom-config/sandbox/results",
	});

	expect(await response.json()).toEqual({
		available: false,
		range: "1h",
		orgs: [],
	});
	expect(query).not.toHaveBeenCalled();
});

test("only 1h and 24h windows are offered", async () => {
	const response = await fetchResults({
		path: "/admin/shadow-atom-config/sandbox/results?range=7d",
	});

	expect(response.status).toBe(400);
	expect(query).not.toHaveBeenCalled();
});

test("an org's own key cannot read shadow results", async () => {
	const response = await fetchResults({
		path: "/admin/shadow-atom-config/sandbox/results",
		scopes: [Scopes.Organisation.Read],
	});

	expect(response.status).toBe(403);
	expect(query).not.toHaveBeenCalled();
});
