import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import type { WorkerHandle } from "../types.ts";

// run.ts sizes its Stripe budget at import time and throws without any key.
const originalStripeKey = process.env.STRIPE_SANDBOX_SECRET_KEY;
process.env.STRIPE_SANDBOX_SECRET_KEY ||= "sk_test_tw_unit_placeholder";
const { buildWorkerEnv, cullExcessIdle } = await import("./run.ts");
const { WorkerPool } = await import("../helpers/pool.ts");

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

	test("runs a single queue worker process", () => {
		expect(buildFor("acct_1").WORKER_PROCESSES).toBe("1");
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

describe("cullExcessIdle", () => {
	const poolOf = (size: number) =>
		new WorkerPool(
			Array.from(
				{ length: size },
				(_, i) => ({ name: `w${i}`, inFlight: 0 }) as WorkerHandle,
			),
		);
	const busyWorkers = (pool: InstanceType<typeof WorkerPool>, count: number) =>
		Promise.all(Array.from({ length: count }, () => pool.acquire()));
	const settlesNow = <T>(promise: Promise<T>) =>
		Promise.race([promise, Bun.sleep(20).then(() => undefined)]);

	test("keeps one idle worker per busy one", async () => {
		const pool = poolOf(20);
		const busy = await busyWorkers(pool, 6);
		const { culled, reserve } = cullExcessIdle({ pool, floor: 4 });
		expect(reserve).toBe(6);
		expect(culled).toHaveLength(8);
		expect(pool.idleCount).toBe(6);
		expect(pool.all.filter((w) => w.inFlight > 0)).toEqual(busy);
	});

	test("keeps the floor once almost nothing is busy", async () => {
		const pool = poolOf(20);
		await busyWorkers(pool, 1);
		cullExcessIdle({ pool, floor: 4 });
		expect(pool.idleCount).toBe(4);
		expect(pool.size).toBe(5);
	});

	test("culls nothing while busy workers outnumber idle ones", async () => {
		const pool = poolOf(10);
		await busyWorkers(pool, 8);
		expect(cullExcessIdle({ pool, floor: 4 }).culled).toHaveLength(0);
		expect(pool.size).toBe(10);
	});

	test("after a cull every running file can retry on a different worker at once", async () => {
		const pool = poolOf(30);
		const busy = await busyWorkers(pool, 5);
		cullExcessIdle({ pool, floor: 4 });
		const retries = busy.map((worker) => {
			pool.release(worker);
			return pool.acquireDifferentFrom(worker.name);
		});
		const granted = await settlesNow(Promise.all(retries));
		expect(granted).toBeDefined();
		granted?.forEach((worker, i) => {
			expect(worker.name).not.toBe(busy[i]?.name);
		});
	});

	test("after a cull every running file's worker can die and reschedule at once", async () => {
		const pool = poolOf(30);
		const busy = await busyWorkers(pool, 5);
		cullExcessIdle({ pool, floor: 4 });
		const reschedules = busy.map((worker) => {
			pool.markDead(worker);
			return pool.acquireDifferentFrom(worker.name, true);
		});
		const granted = await settlesNow(Promise.all(reschedules));
		expect(granted?.map((w) => w.name).sort()).toEqual(
			pool.all.map((w) => w.name).sort(),
		);
	});
});
