import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";

// run.ts sizes its Stripe budget at import time and throws without any key.
const originalStripeKey = process.env.STRIPE_SANDBOX_SECRET_KEY;
process.env.STRIPE_SANDBOX_SECRET_KEY ||= "sk_test_tw_unit_placeholder";
const { buildWorkerEnv } = await import("./run.ts");

afterAll(() => {
	if (originalStripeKey === undefined)
		delete process.env.STRIPE_SANDBOX_SECRET_KEY;
	else process.env.STRIPE_SANDBOX_SECRET_KEY = originalStripeKey;
});

const REQUIRED_SECRETS = [
	"ENCRYPTION_IV",
	"ENCRYPTION_PASSWORD",
	"BETTER_AUTH_SECRET",
];
const TOUCHED_KEYS = [...REQUIRED_SECRETS, "ANTHROPIC_API_KEY"];

const buildFor = (stripeAccountId: string) =>
	buildWorkerEnv({
		stripeAccountId,
		stripeSecretKey: "sk_test_worker",
		capabilities: [],
		ingressUrl: "https://ingress.example.com",
		ingressToken: "ingress-token",
	});

describe("buildWorkerEnv app config", () => {
	const saved: Record<string, string | undefined> = {};

	beforeEach(() => {
		for (const key of TOUCHED_KEYS) saved[key] = process.env[key];
		for (const key of REQUIRED_SECRETS) process.env[key] = `test-${key}`;
		delete process.env.ANTHROPIC_API_KEY;
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

		expect(first).toMatch(/^[0-9a-f]{64}$/);
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

	test("passes ANTHROPIC_API_KEY through when the orchestrator has it", () => {
		process.env.ANTHROPIC_API_KEY = "anthropic-from-orchestrator";

		expect(buildFor("acct_1").ANTHROPIC_API_KEY).toBe(
			"anthropic-from-orchestrator",
		);
	});

	test("omits ANTHROPIC_API_KEY when the orchestrator lacks it", () => {
		expect(buildFor("acct_1")).not.toHaveProperty("ANTHROPIC_API_KEY");
	});
});

describe("buildWorkerEnv stripe-connect shard", () => {
	const build = ({
		capabilities,
		stripeClientId,
	}: {
		capabilities: ("svix" | "stripe-connect")[];
		stripeClientId?: string;
	}) =>
		buildWorkerEnv({
			stripeAccountId: "acct_1",
			stripeSecretKey: "sk_test_shard",
			capabilities,
			stripeClientId,
			ingressUrl: "https://ingress.example.com",
			ingressToken: "ingress-token",
		});

	beforeEach(() => {
		for (const key of REQUIRED_SECRETS) process.env[key] ??= `test-${key}`;
	});

	test("gives the shard worker its platform's key and Connect client_id", () => {
		const env = build({
			capabilities: ["stripe-connect"],
			stripeClientId: "ca_shard",
		});
		expect(env.STRIPE_SANDBOX_CLIENT_ID).toBe("ca_shard");
		expect(env.STRIPE_SANDBOX_SECRET_KEY).toBe("sk_test_shard");
	});

	test("refuses to build a shard worker without a client_id", () => {
		expect(() => build({ capabilities: ["stripe-connect"] })).toThrow(
			"client_id",
		);
	});

	test("normal workers never get a Connect client_id", () => {
		expect(
			build({ capabilities: [], stripeClientId: "ca_shard" }),
		).not.toHaveProperty("STRIPE_SANDBOX_CLIENT_ID");
	});
});

describe("buildWorkerEnv pg-replica shard", () => {
	const build = (capabilities: "pg-replica"[]) =>
		buildWorkerEnv({
			stripeAccountId: "acct_1",
			stripeSecretKey: "sk_test_worker",
			capabilities,
			ingressUrl: "https://ingress.example.com",
			ingressToken: "ingress-token",
		});

	beforeEach(() => {
		for (const key of REQUIRED_SECRETS) process.env[key] ??= `test-${key}`;
	});

	test("points the shard's server and tests at the worker's own standby", () => {
		const env = build(["pg-replica"]);
		expect(env.TW_PG_REPLICA).toBe("1");
		expect(env.DATABASE_REPLICA_URL).toBe(
			"postgresql://postgres:postgres@localhost:5433/autumn",
		);
		expect(env.DATABASE_URL).not.toBe(env.DATABASE_REPLICA_URL);
	});

	test("normal workers get no replica", () => {
		const env = build([]);
		expect(env).not.toHaveProperty("TW_PG_REPLICA");
		expect(env).not.toHaveProperty("DATABASE_REPLICA_URL");
	});
});
