import { afterEach, describe, expect, test } from "bun:test";
import {
	createTracker,
	type TrackTokensParams,
	trackTokenUsage,
} from "../../src/shared/track.js";

const params: TrackTokensParams = {
	inputTokens: 10,
	outputTokens: 5,
	cacheReadTokens: 0,
	cacheWriteTokens: 0,
	reasoningTokens: 0,
	audioInputTokens: 0,
	customerId: "cus_123",
	modelId: "openrouter/openai/gpt-4o",
};

describe("trackTokenUsage client shapes", () => {
	test("calls root-level trackTokens bound to the client (current @useautumn/sdk)", async () => {
		const calls: TrackTokensParams[] = [];

		// Class instance so an unbound invocation would lose `this` and throw.
		class FakeSdk {
			private readonly sink = calls;
			async trackTokens(p: TrackTokensParams) {
				this.sink.push(p);
			}
		}

		await trackTokenUsage({
			autumn: new FakeSdk(),
			getParams: () => params,
		});

		expect(calls).toEqual([params]);
	});

	test("prefers balances.trackTokens when present, bound to balances", async () => {
		const calls: string[] = [];

		class Balances {
			private readonly name = "balances";
			async trackTokens(_p: TrackTokensParams) {
				calls.push(this.name);
			}
		}

		await trackTokenUsage({
			autumn: {
				balances: new Balances(),
				trackTokens: async () => {
					calls.push("root");
				},
			},
			getParams: () => params,
		});

		expect(calls).toEqual(["balances"]);
	});

	test("a client with neither shape logs and never throws", async () => {
		await expect(
			trackTokenUsage({ autumn: {}, getParams: () => params }),
		).resolves.toBeUndefined();
	});
});

describe("env fallback client", () => {
	const originalFetch = globalThis.fetch;
	const originalKey = process.env.AUTUMN_API_KEY;

	afterEach(() => {
		globalThis.fetch = originalFetch;
		if (originalKey === undefined) {
			Reflect.deleteProperty(process.env, "AUTUMN_API_KEY");
		} else {
			process.env.AUTUMN_API_KEY = originalKey;
		}
	});

	test("no autumn client → POSTs snake_case wire params with the env key", async () => {
		process.env.AUTUMN_API_KEY = "am_sk_test";

		const requests: { url: string; init: RequestInit }[] = [];
		globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
			requests.push({ url: String(url), init: init ?? {} });
			return new Response(JSON.stringify({ value: 0.1 }), {
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch;

		await createTracker({ customerId: "cus_123" })(() => ({
			pools: {
				inputTokens: 10,
				outputTokens: 5,
				cacheReadTokens: 0,
				cacheWriteTokens: 0,
				reasoningTokens: 0,
			},
			modelId: "openrouter/openai/gpt-4o",
		}));

		expect(requests).toHaveLength(1);
		expect(requests[0]?.url).toBe(
			"https://api.useautumn.com/v1/balances.track_tokens",
		);
		const headers = requests[0]?.init.headers as Record<string, string>;
		expect(headers.authorization).toBe("Bearer am_sk_test");
		expect(JSON.parse(String(requests[0]?.init.body))).toEqual({
			customer_id: "cus_123",
			model_id: "openrouter/openai/gpt-4o",
			input_tokens: 10,
			output_tokens: 5,
			cache_read_tokens: 0,
			cache_write_tokens: 0,
			reasoning_tokens: 0,
		});
	});

	test("missing key is logged, never thrown", async () => {
		// Assigning undefined would store the string "undefined"
		Reflect.deleteProperty(process.env, "AUTUMN_API_KEY");
		Reflect.deleteProperty(process.env, "AUTUMN_SECRET_KEY");

		await expect(
			createTracker({ customerId: "cus_123" })(() => ({
				pools: {
					inputTokens: 1,
					outputTokens: 1,
					cacheReadTokens: 0,
					cacheWriteTokens: 0,
					reasoningTokens: 0,
				},
				modelId: "openrouter/openai/gpt-4o",
			})),
		).resolves.toBeUndefined();
	});
});
