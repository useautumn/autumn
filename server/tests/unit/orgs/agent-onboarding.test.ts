import { describe, expect, test } from "bun:test";
import { META_SCOPES, ROLE_SCOPES } from "@autumn/shared";
import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { getTrustedClientIp } from "@/internal/misc/rateLimiter/public/getTrustedClientIp.js";
import {
	AGENT_PROVISIONAL_API_KEY_SCOPES,
	AGENT_USER_API_KEY_SCOPES,
	grantAgentUserApiKeyScopes,
} from "@/internal/orgs/agentOnboarding/agentAuthScopeKeys.js";
import {
	createAgentClaimIntent,
	getAgentClaimAttemptIdentifier,
	getAgentClaimIntentFromHeaders,
	getAgentClaimPointerIdentifier,
	hashAgentAuthSubject,
	normalizeAgentEmail,
} from "@/internal/orgs/agentOnboarding/agentAuthUtils.js";
import { parseAgentClaimAttempt } from "@/internal/orgs/agentOnboarding/repos/agentChallengeRepo.js";
import { updateAgentSessionOrg } from "@/internal/orgs/agentOnboarding/repos/agentOrgRepo.js";

const getClientIp = ({ headers }: { headers: HeadersInit }): string => {
	const app = new Hono<HonoEnv>();
	let clientIp = "";
	app.get("/", (c) => {
		clientIp = getTrustedClientIp({ c });
		return c.body(null);
	});
	void app.request("/", { headers });
	return clientIp;
};

describe("agent onboarding", () => {
	test("uses Cloudflare's client address when present", () => {
		expect(
			getClientIp({
				headers: {
					"cf-connecting-ip": "203.0.113.10",
					"x-forwarded-for": "198.51.100.1, 10.0.0.1",
				},
			}),
		).toBe("203.0.113.10");
	});

	test("uses the address before the trusted proxy", () => {
		expect(
			getClientIp({
				headers: {
					"x-forwarded-for": "198.51.100.1, 10.0.0.1",
				},
			}),
		).toBe("198.51.100.1");
	});

	test("falls back to one shared bucket when no trusted address is present", () => {
		expect(getClientIp({ headers: {} })).toBe("unknown");
	});

	test("hashes challenge and rate-limit subjects without retaining secrets", () => {
		const email = normalizeAgentEmail({ email: " Agent@Example.com " });
		const hashed = hashAgentAuthSubject({ value: email });

		expect(email).toBe("agent@example.com");
		expect(hashed).toHaveLength(64);
		expect(hashed).not.toContain(email);
		expect(getAgentClaimAttemptIdentifier({ attemptTokenHash: hashed })).toBe(
			`agent-claim-attempt:${hashed}`,
		);
		expect(getAgentClaimPointerIdentifier({ claimTokenHash: hashed })).toBe(
			`agent-claim-pointer:${hashed}`,
		);
	});

	test("accepts only signed claim intent cookies", () => {
		const intent = createAgentClaimIntent({ attemptToken: "attempt-token" });
		expect(
			getAgentClaimIntentFromHeaders({
				headers: { cookie: `autumn_agent_claim=${encodeURIComponent(intent)}` },
			}),
		).toBe("attempt-token");
		expect(
			getAgentClaimIntentFromHeaders({
				headers: { cookie: "autumn_agent_claim=spoofed" },
			}),
		).toBeNull();
		expect(getAgentClaimIntentFromHeaders({ headers: undefined })).toBeNull();
	});

	test("provisional and durable keys use explicit least-privilege scopes", () => {
		expect(AGENT_PROVISIONAL_API_KEY_SCOPES.length).toBeGreaterThan(0);
		expect(AGENT_USER_API_KEY_SCOPES.length).toBeGreaterThan(0);
		expect(AGENT_PROVISIONAL_API_KEY_SCOPES).not.toContain("apiKeys:write");
		expect(AGENT_USER_API_KEY_SCOPES).toContain("apiKeys:write");
	});

	test("provisional keys get exactly the keyless agent scope set", () => {
		const scopes: string[] = [...AGENT_PROVISIONAL_API_KEY_SCOPES];
		expect(scopes.sort()).toEqual(
			[
				"organisation:read",
				"organisation:write",
				"features:read",
				"features:write",
				"plans:read",
				"plans:write",
				"rewards:read",
				"rewards:write",
				"customers:read",
				"customers:write",
				"balances:read",
				"balances:write",
				"billing:read",
				"billing:write",
				"analytics:read",
				"migrations:read",
				"migrations:write",
			].sort(),
		);
		expect(scopes).toContain("analytics:read");
		expect(scopes).toContain("migrations:read");
		expect(scopes).toContain("migrations:write");
		for (const scope of [
			"apiKeys:read",
			"apiKeys:write",
			"platform:read",
			"platform:write",
			...META_SCOPES,
		]) {
			expect(scopes).not.toContain(scope);
		}
		expect(scopes).not.toContain("");
	});

	test("user-bound keys only receive scopes the member already has", () => {
		expect(
			grantAgentUserApiKeyScopes({ userScopes: ROLE_SCOPES.owner }),
		).toEqual([...AGENT_USER_API_KEY_SCOPES]);
		expect(
			grantAgentUserApiKeyScopes({ userScopes: ROLE_SCOPES.member }),
		).not.toContain("apiKeys:write");
		expect(grantAgentUserApiKeyScopes({ userScopes: [] })).toEqual([]);
	});

	test("challenge purpose comes only from the stored envelope", () => {
		const stored = parseAgentClaimAttempt({
			value: JSON.stringify({
				version: 1,
				purpose: "claim",
				email: "agent@example.com",
				claimTokenHash: "a".repeat(64),
				attemptTokenHash: "b".repeat(64),
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
			}),
		});

		expect(stored?.purpose).toBe("claim");
		expect(
			parseAgentClaimAttempt({
				value: JSON.stringify({
					...stored,
					purpose: "admin",
				}),
			}),
		).toBeNull();
		expect(
			parseAgentClaimAttempt({
				value: JSON.stringify({ ...stored, attemptTokenHash: "raw-secret" }),
			}),
		).toBeNull();
	});

	test("post-auth transaction rejects a missing session update", async () => {
		const db = {
			update: () => ({
				set: () => ({
					where: () => ({
						returning: async () => [],
					}),
				}),
			}),
		};

		expect(
			await updateAgentSessionOrg({
				db: db as never,
				sessionToken: "missing-session",
				organizationId: "org_1",
			}),
		).toBe(false);
	});
});
