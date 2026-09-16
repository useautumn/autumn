import { expect, test } from "bun:test";
import {
	completeAgentClaim,
	getAgentClaimDetails,
} from "../src/views/auth/agentClaimApi";

test("claim detail requests carry only the encoded attempt token", async () => {
	const originalFetch = globalThis.fetch;
	let requestedUrl = "";
	globalThis.fetch = (async (input) => {
		requestedUrl = String(input);
		return Response.json({
			status: "ready",
			organization: { id: "org_1", name: "Acme", slug: "acme" },
			email: "owner@example.com",
			expires_at: new Date().toISOString(),
		});
	}) as typeof fetch;

	try {
		await getAgentClaimDetails({ token: "attempt / secret" });
		expect(requestedUrl).toEndWith(
			"/agent.preview_claim?token=attempt%20%2F%20secret",
		);
		expect(requestedUrl).not.toContain("owner@example.com");
		expect(requestedUrl).not.toContain("org_1");
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("claim completion sends only the attempt token with credentials", async () => {
	const originalFetch = globalThis.fetch;
	let request: RequestInit | undefined;
	globalThis.fetch = (async (_input, init) => {
		request = init;
		return Response.json({
			organization_id: "org_1",
			organization_slug: "acme",
			user_id: "user_1",
			email: "owner@example.com",
		});
	}) as typeof fetch;

	try {
		await completeAgentClaim({ token: "attempt-token" });
		expect(request?.credentials).toBe("include");
		expect(request?.method).toBe("POST");
		expect(JSON.parse(String(request?.body))).toEqual({
			token: "attempt-token",
		});
	} finally {
		globalThis.fetch = originalFetch;
	}
});
