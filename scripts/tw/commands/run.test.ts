import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { buildWorkerEnv } from "./run.ts";

const REQUIRED_SECRETS = [
	"ENCRYPTION_IV",
	"ENCRYPTION_PASSWORD",
	"BETTER_AUTH_SECRET",
];
const PASS_THROUGH_KEYS = ["ANTHROPIC_API_KEY", "STRIPE_SANDBOX_CLIENT_ID"];
const TOUCHED_KEYS = [...REQUIRED_SECRETS, ...PASS_THROUGH_KEYS];

const buildFor = (stripeAccountId: string) =>
	buildWorkerEnv({
		stripeAccountId,
		stripeSecretKey: "sk_test_worker",
		isSvixShard: false,
		ingressUrl: "https://ingress.example.com",
		ingressToken: "ingress-token",
	});

describe("buildWorkerEnv app config", () => {
	const saved: Record<string, string | undefined> = {};

	beforeEach(() => {
		for (const key of TOUCHED_KEYS) saved[key] = process.env[key];
		for (const key of REQUIRED_SECRETS) process.env[key] = `test-${key}`;
		for (const key of PASS_THROUGH_KEYS) delete process.env[key];
	});

	afterEach(() => {
		for (const key of TOUCHED_KEYS) {
			if (saved[key] === undefined) delete process.env[key];
			else process.env[key] = saved[key];
		}
	});

	test("gives every worker the same customer JWT secret of at least 32 chars", () => {
		const first = buildFor("acct_1").CUSTOMER_JWT_SECRET;
		const second = buildFor("acct_2").CUSTOMER_JWT_SECRET;

		expect(first).toBeString();
		expect(first.length).toBeGreaterThanOrEqual(32);
		expect(second).toBe(first);
	});

	test("points CLIENT_URL at the local dashboard", () => {
		expect(buildFor("acct_1").CLIENT_URL).toBe("http://localhost:3000");
	});

	test("sets placeholder RevenueCat OAuth client credentials", () => {
		const env = buildFor("acct_1");

		expect(env.REVENUECAT_OAUTH_CLIENT_ID).toBeTruthy();
		expect(env.REVENUECAT_OAUTH_CLIENT_SECRET).toBeTruthy();
	});

	test("passes through orchestrator-only keys when present", () => {
		process.env.ANTHROPIC_API_KEY = "anthropic-from-orchestrator";
		process.env.STRIPE_SANDBOX_CLIENT_ID = "ca_from_orchestrator";

		const env = buildFor("acct_1");

		expect(env.ANTHROPIC_API_KEY).toBe("anthropic-from-orchestrator");
		expect(env.STRIPE_SANDBOX_CLIENT_ID).toBe("ca_from_orchestrator");
	});

	test("omits pass-through keys when the orchestrator lacks them", () => {
		const env = buildFor("acct_1");

		expect(env).not.toHaveProperty("ANTHROPIC_API_KEY");
		expect(env).not.toHaveProperty("STRIPE_SANDBOX_CLIENT_ID");
	});
});
