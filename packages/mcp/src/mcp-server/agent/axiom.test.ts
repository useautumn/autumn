import { describe, expect, test } from "bun:test";
import { Scopes } from "@autumn/shared/scopeDefinitions";
import type { AutumnMcpAuth } from "./auth.js";
import { resolveAutumnOrgId } from "./auth.js";
import { prepareAxiomQuery } from "./axiom.js";

const auth: AutumnMcpAuth & { orgId: string } = {
	apiKey: "sk_test",
	env: "sandbox",
	principalId: "test",
	resource: "http://localhost:2718/mcp",
	scopes: [Scopes.Analytics.Read],
	orgId: "org_123",
};

describe("Axiom MCP tools", () => {
	test("injects authenticated org and env filters after the express source", () => {
		const query = prepareAxiomQuery({
			auth,
			apl: "['express'] | where ['level'] == 'ERROR' | limit 10",
			startTime: "now-30m",
			endTime: "now",
		});

		expect(query.apl).toBe(
			[
				"['express']",
				"| where ['context.org_id'] == 'org_123'",
				"| where ['context.env'] == 'sandbox'",
				"| where ['level'] == 'ERROR' | limit 10",
			].join("\n"),
		);
	});

	test("rejects unsafe APL shapes", () => {
		expect(() =>
			prepareAxiomQuery({
				auth,
				apl: "['express'] | union ['other']",
			}),
		).toThrow("query shape is not allowed");

		expect(() =>
			prepareAxiomQuery({
				auth,
				apl: "['other'] | limit 10",
			}),
		).toThrow("must start from ['express']");

		expect(() =>
			prepareAxiomQuery({
				auth,
				apl: "['express'] | ['other'] | limit 10",
			}),
		).toThrow("only use the express dataset source once");
	});

	test("rejects Axiom access without analytics read scope", () => {
		expect(() =>
			prepareAxiomQuery({
				auth: { ...auth, scopes: [] },
				apl: "['express'] | limit 10",
			}),
		).toThrow("analytics:read scope is required");
	});

	test("resolves static API-key auth to an Autumn org", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe("http://localhost:8080/v1/organization");
			expect(init?.headers).toMatchObject({
				Authorization: "Bearer sk_static",
			});
			return Response.json({ id: "org_static", slug: "static-org" });
		}) as typeof fetch;

		try {
			await expect(
				resolveAutumnOrgId({
					...auth,
					apiKey: "sk_static",
					orgId: undefined,
					serverURL: "http://localhost:8080",
				}),
			).resolves.toBe("org_static");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
