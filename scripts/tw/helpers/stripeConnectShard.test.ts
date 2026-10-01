import { afterEach, expect, mock, test } from "bun:test";
import {
	ensureStripeConnectWebhook,
	resolveStripeConnectShard,
	STRIPE_CONNECT_SHARD_ENV_VARS,
	splitStripeConnectShard,
	stripeConnectWebhookUrl,
	unavailableShardExecutor,
} from "./stripeConnectShard.ts";

// The real client factory pulls in the server's Redis/Kafka graph, which keeps the test process alive.
mock.module("@server/external/connect/stripeFromKey.js", () => ({
	stripeClientForKey: () => {
		throw new Error("unused");
	},
}));
const { collectPoolKeys, resolvePoolKeys } = await import("./stripeKeyPool.ts");

const SHARD_KEY = "sk_test_shard_only";
const events = ["account.application.deauthorized"];
const POOL_KEY = "sk_test_pool_a";
const savedEnv = { ...process.env };

afterEach(() => {
	for (const name of [
		...STRIPE_CONNECT_SHARD_ENV_VARS,
		"STRIPE_TEST_KEY_POOL",
		"STRIPE_TEST_KEY_POOL_OLD",
		"STRIPE_SANDBOX_SECRET_KEY",
	]) {
		if (savedEnv[name] === undefined) delete process.env[name];
		else process.env[name] = savedEnv[name];
	}
});

const fakeStripe = (initialUrls: string[]) => {
	const endpoints = initialUrls.map((url, index) => ({
		id: `we_${index}`,
		url,
	}));
	const created: { url: string; connect?: boolean }[] = [];
	const stripe = {
		webhookEndpoints: {
			list: () =>
				(async function* () {
					yield* endpoints;
				})(),
			create: async (params: {
				url: string;
				enabled_events: string[];
				connect?: boolean;
			}) => {
				created.push(params);
				const endpoint = { id: `we_new_${created.length}`, url: params.url };
				endpoints.push(endpoint);
				return endpoint;
			},
			del: () => {
				throw new Error("the shard endpoint is never deleted");
			},
		},
	};
	return { stripe, created };
};

test("the shard is configured only when both SHARD_STRIPE_* vars are set", () => {
	expect(resolveStripeConnectShard({})).toBeNull();
	expect(
		resolveStripeConnectShard({ SHARD_STRIPE_SANDBOX_KEY: SHARD_KEY }),
	).toBeNull();
	expect(
		resolveStripeConnectShard({ SHARD_STRIPE_CLIENT_ID: "ca_shard" }),
	).toBeNull();
	expect(
		resolveStripeConnectShard({
			SHARD_STRIPE_SANDBOX_KEY: SHARD_KEY,
			SHARD_STRIPE_CLIENT_ID: "ca_shard",
		}),
	).toEqual({ secretKey: SHARD_KEY, clientId: "ca_shard" });
});

test("an unconfigured shard fails each file with a clear message instead of running it", async () => {
	const chunks: string[] = [];
	const result = await unavailableShardExecutor({
		reason: "SHARD_STRIPE_SANDBOX_KEY is not set",
	}).run({ file: "oauth.test.ts", onChunk: (text) => chunks.push(text) });
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain("stripe-connect shard not configured");
	expect(result.stderr).toContain("SHARD_STRIPE_SANDBOX_KEY is not set");
	expect(chunks.join("")).toContain("stripe-connect shard not configured");
});

test("the shard webhook is created once on first use and reused after", async () => {
	const url = stripeConnectWebhookUrl({ ingressUrl: "https://twd.example/" });
	expect(url).toBe(
		"https://twd.example/ingress/connect/sandbox?shard=stripe-connect",
	);
	const { stripe, created } = fakeStripe([
		"https://twd.example/ingress/connect/sandbox",
	]);

	const first = await ensureStripeConnectWebhook({ stripe, url, events });
	const second = await ensureStripeConnectWebhook({ stripe, url, events });

	expect(first).toEqual({ id: "we_new_1", created: true });
	expect(second).toEqual({ id: "we_new_1", created: false });
	expect(created).toHaveLength(1);
	expect(created[0]).toMatchObject({
		url,
		connect: true,
		enabled_events: events,
	});
});

test("an existing shard webhook is adopted without creating another", async () => {
	const url = stripeConnectWebhookUrl({ ingressUrl: "https://twd.example" });
	const { stripe, created } = fakeStripe(["https://other.example/hook", url]);
	expect(await ensureStripeConnectWebhook({ stripe, url, events })).toEqual({
		id: "we_1",
		created: false,
	});
	expect(created).toHaveLength(0);
});

test("the shard key never enters the Stripe key pool", () => {
	process.env.SHARD_STRIPE_SANDBOX_KEY = SHARD_KEY;
	process.env.STRIPE_TEST_KEY_POOL = `${POOL_KEY},${SHARD_KEY}`;
	process.env.STRIPE_TEST_KEY_POOL_OLD = SHARD_KEY;
	expect(collectPoolKeys()).toEqual([POOL_KEY]);
});

test("the single-key fallback never hands out the shard key", () => {
	process.env.SHARD_STRIPE_SANDBOX_KEY = SHARD_KEY;
	process.env.STRIPE_TEST_KEY_POOL = "";
	process.env.STRIPE_TEST_KEY_POOL_OLD = "";
	process.env.STRIPE_SANDBOX_SECRET_KEY = SHARD_KEY;
	expect(() => resolvePoolKeys()).toThrow(
		"reserved for the stripe-connect shard",
	);
	process.env.STRIPE_SANDBOX_SECRET_KEY = POOL_KEY;
	expect(resolvePoolKeys()).toEqual([POOL_KEY]);
});

test("every stripe-connect file lands on one dedicated shard, whatever else it needs", () => {
	expect(
		splitStripeConnectShard([
			{ capabilities: ["svix"], files: ["svix.test.ts"] },
			{ capabilities: ["stripe-connect"], files: ["oauth.test.ts"] },
			{
				capabilities: ["svix", "stripe-connect"],
				files: ["oauth-svix.test.ts"],
			},
		]),
	).toEqual({
		pooledShards: [{ capabilities: ["svix"], files: ["svix.test.ts"] }],
		stripeConnectShard: {
			capabilities: ["svix", "stripe-connect"],
			files: ["oauth.test.ts", "oauth-svix.test.ts"],
		},
	});
	expect(
		splitStripeConnectShard([{ capabilities: ["leaf"], files: ["l.test.ts"] }]),
	).toEqual({
		pooledShards: [{ capabilities: ["leaf"], files: ["l.test.ts"] }],
		stripeConnectShard: undefined,
	});
});
