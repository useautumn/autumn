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
const events = ["account.application.deauthorized", "customer.updated"];
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

type FakeEndpoint = {
	id: string;
	url: string;
	enabled_events: string[];
	status: string;
	metadata: Record<string, string>;
};

const fakeStripe = (initial: Partial<FakeEndpoint>[]) => {
	const endpoints: FakeEndpoint[] = initial.map((endpoint, index) => ({
		id: `we_${index}`,
		url: "",
		enabled_events: events,
		status: "enabled",
		metadata: {},
		...endpoint,
	}));
	const created: Record<string, unknown>[] = [];
	const updated: { id: string; params: Record<string, unknown> }[] = [];
	const stripe = {
		webhookEndpoints: {
			list: () =>
				(async function* () {
					yield* endpoints;
				})(),
			create: async (params: {
				url: string;
				enabled_events: string[];
				connect: boolean;
				metadata: Record<string, string>;
			}) => {
				created.push(params);
				const endpoint = {
					id: `we_new_${created.length}`,
					status: "enabled",
					...params,
				};
				endpoints.push(endpoint);
				return endpoint;
			},
			update: async (
				id: string,
				params: {
					enabled_events: string[];
					disabled: boolean;
					metadata: Record<string, string>;
				},
			) => {
				updated.push({ id, params });
				return { id };
			},
			del: () => {
				throw new Error("the shard endpoint is never deleted");
			},
		},
	};
	return { stripe, created, updated };
};

const url = stripeConnectWebhookUrl({ ingressUrl: "https://twd.example/" });
const ours = { url, metadata: { autumn_tw_shard: "stripe-connect" } };

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

test("the shard webhook is created once, as a tagged Connect endpoint, and reused after", async () => {
	expect(url).toBe(
		"https://twd.example/ingress/connect/sandbox?shard=stripe-connect",
	);
	const { stripe, created, updated } = fakeStripe([
		{ url: "https://twd.example/ingress/connect/sandbox" },
	]);

	const first = await ensureStripeConnectWebhook({ stripe, url, events });
	const second = await ensureStripeConnectWebhook({ stripe, url, events });

	expect(first).toEqual({ id: "we_new_1", created: true, repaired: false });
	expect(second).toEqual({ id: "we_new_1", created: false, repaired: false });
	expect(created).toEqual([
		{
			url,
			connect: true,
			enabled_events: events,
			metadata: { autumn_tw_shard: "stripe-connect" },
		},
	]);
	expect(updated).toEqual([]);
});

test("a shard webhook missing events or disabled is repaired in place", async () => {
	const { stripe, created, updated } = fakeStripe([
		{ ...ours, enabled_events: ["customer.created"], status: "disabled" },
	]);
	expect(await ensureStripeConnectWebhook({ stripe, url, events })).toEqual({
		id: "we_0",
		created: false,
		repaired: true,
	});
	expect(updated).toEqual([
		{
			id: "we_0",
			params: {
				enabled_events: ["customer.created", ...events],
				disabled: false,
				metadata: { autumn_tw_shard: "stripe-connect" },
			},
		},
	]);
	expect(created).toEqual([]);

	const all = fakeStripe([{ ...ours, enabled_events: ["*"] }]);
	expect(
		await ensureStripeConnectWebhook({ stripe: all.stripe, url, events }),
	).toMatchObject({ repaired: false });
});

test("an untagged endpoint at the shard URL, left by the first version, is adopted and tagged", async () => {
	const { stripe, created, updated } = fakeStripe([
		{ url, enabled_events: ["account.application.deauthorized"] },
	]);
	expect(await ensureStripeConnectWebhook({ stripe, url, events })).toEqual({
		id: "we_0",
		created: false,
		repaired: true,
	});
	expect(updated).toEqual([
		{
			id: "we_0",
			params: {
				enabled_events: [
					"account.application.deauthorized",
					"customer.updated",
				],
				disabled: false,
				metadata: { autumn_tw_shard: "stripe-connect" },
			},
		},
	]);
	expect(created).toEqual([]);
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
