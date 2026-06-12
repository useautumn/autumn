import { describe, expect, test } from "bun:test";
import {
	type OpenRouterLike,
	trackingSettled,
	trackOpenRouterUsage,
	withAutumn,
} from "../../src/openrouter/index.js";
import type { TrackTokensParams } from "../../src/shared/track.js";

const usage = {
	promptTokens: 13,
	completionTokens: 7,
	promptTokensDetails: { cachedTokens: 2, cacheWriteTokens: 1 },
	completionTokensDetails: { reasoningTokens: 2 },
	cost: 0.0042,
};

const expectedPools = {
	inputTokens: 10,
	outputTokens: 5,
	cacheReadTokens: 2,
	cacheWriteTokens: 1,
	reasoningTokens: 2,
	audioInputTokens: 0,
};

const createAutumn = () => {
	const calls: TrackTokensParams[] = [];

	return {
		calls,
		autumn: {
			balances: {
				trackTokens: async (params: TrackTokensParams) => {
					calls.push(params);
				},
			},
		},
	};
};

type SendRequest = Record<string, unknown>;

const createClient = (result: unknown) => {
	const requests: SendRequest[] = [];
	const client = {
		apiKey: "sk-test",
		chat: {
			send: async (request: SendRequest) => {
				requests.push(request);
				return result;
			},
		},
		models: {
			list: async () => ["openai/gpt-4o"],
		},
	};
	return { client: client as OpenRouterLike & typeof client, requests };
};

const streamOf = (chunks: unknown[]): AsyncIterable<unknown> => ({
	async *[Symbol.asyncIterator]() {
		for (const chunk of chunks) {
			yield chunk;
		}
	},
});

describe("withAutumn (openrouter)", () => {
	test("non-streaming send tracks normalized pools with openrouter cost", async () => {
		const { calls, autumn } = createAutumn();
		const { client, requests } = createClient({
			model: "openai/gpt-4o",
			usage,
			choices: [],
		});

		const wrapped = withAutumn({
			autumn,
			openRouter: client,
			customerId: "cus_123",
			properties: { source: "test" },
		});

		await wrapped.chat.send({ model: "openai/gpt-4o", messages: [] });

		expect(requests[0]?.usage).toEqual({ include: true });
		expect(calls).toEqual([
			{
				...expectedPools,
				customerId: "cus_123",
				modelId: "openrouter/openai/gpt-4o",
				featureId: undefined,
				entityId: undefined,
				properties: { source: "test", openrouter_cost: 0.0042 },
			},
		]);
	});

	test("preserves caller usage options while forcing include", async () => {
		const { autumn } = createAutumn();
		const { client, requests } = createClient({
			model: "openai/gpt-4o",
			usage,
		});

		const wrapped = withAutumn({
			autumn,
			openRouter: client,
			customerId: "cus_123",
		});
		await wrapped.chat.send({
			model: "openai/gpt-4o",
			messages: [],
			usage: { include: false },
		});

		expect(requests[0]?.usage).toEqual({ include: true });
	});

	test("prefers the requested slug over a provider-resolved snapshot slug", async () => {
		const { calls, autumn } = createAutumn();
		const { client } = createClient({
			// Providers resolve aliases to dated snapshots that pricing data
			// may not list — the requested slug must win.
			model: "anthropic/claude-5-fable-20260609",
			usage,
		});

		const wrapped = withAutumn({
			autumn,
			openRouter: client,
			customerId: "cus_123",
		});
		await wrapped.chat.send({
			model: "anthropic/claude-fable-5",
			messages: [],
		});

		expect(calls[0]?.modelId).toBe("openrouter/anthropic/claude-fable-5");
	});

	test("router pseudo-models use the resolved slug from the response", async () => {
		const { calls, autumn } = createAutumn();
		const { client } = createClient({ model: "openai/gpt-4o", usage });

		const wrapped = withAutumn({
			autumn,
			openRouter: client,
			customerId: "cus_123",
		});
		await wrapped.chat.send({ model: "openrouter/auto", messages: [] });

		expect(calls[0]?.modelId).toBe("openrouter/openai/gpt-4o");
	});

	test("falls back to the request model when the response omits one", async () => {
		const { calls, autumn } = createAutumn();
		const { client } = createClient({ usage });

		const wrapped = withAutumn({
			autumn,
			openRouter: client,
			customerId: "cus_123",
		});
		await wrapped.chat.send({ model: "openai/gpt-4o", messages: [] });

		expect(calls[0]?.modelId).toBe("openrouter/openai/gpt-4o");
	});

	test("streaming tracks once from the final usage chunk", async () => {
		const { calls, autumn } = createAutumn();
		const { client } = createClient(
			streamOf([
				{ choices: [{ delta: { content: "hel" } }], usage: null },
				{ choices: [{ delta: { content: "lo" } }], usage: null },
				{ model: "openai/gpt-4o", choices: [], usage },
			]),
		);

		const wrapped = withAutumn({
			autumn,
			openRouter: client,
			customerId: "cus_123",
		});
		const stream = (await wrapped.chat.send({
			model: "openrouter/auto",
			messages: [],
			stream: true,
		})) as AsyncIterable<{ choices?: { delta?: { content?: string } }[] }>;

		let text = "";
		for await (const chunk of stream) {
			text += chunk.choices?.[0]?.delta?.content ?? "";
		}

		expect(text).toBe("hello");
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			...expectedPools,
			modelId: "openrouter/openai/gpt-4o",
		});
	});

	test("streaming does not track when iteration stops before usage arrives", async () => {
		const { calls, autumn } = createAutumn();
		const { client } = createClient(
			streamOf([
				{ choices: [{ delta: { content: "hel" } }], usage: null },
				{ model: "openai/gpt-4o", choices: [], usage },
			]),
		);

		const wrapped = withAutumn({
			autumn,
			openRouter: client,
			customerId: "cus_123",
		});
		const stream = (await wrapped.chat.send({
			model: "openai/gpt-4o",
			messages: [],
			stream: true,
		})) as AsyncIterable<unknown>;

		for await (const _chunk of stream) {
			break;
		}

		expect(calls).toHaveLength(0);
	});

	test("missing usage is caught and never breaks the response", async () => {
		const { calls, autumn } = createAutumn();
		const { client } = createClient({ model: "openai/gpt-4o", usage: null });

		const wrapped = withAutumn({
			autumn,
			openRouter: client,
			customerId: "cus_123",
		});
		const result = (await wrapped.chat.send({
			model: "openai/gpt-4o",
			messages: [],
		})) as { model: string };

		expect(result.model).toBe("openai/gpt-4o");
		expect(calls).toHaveLength(0);
	});

	test("non-chat properties and methods pass through", async () => {
		const { autumn } = createAutumn();
		const { client } = createClient({ model: "openai/gpt-4o", usage });

		const wrapped = withAutumn({
			autumn,
			openRouter: client,
			customerId: "cus_123",
		});

		expect(wrapped.apiKey).toBe("sk-test");
		expect(await wrapped.models.list()).toEqual(["openai/gpt-4o"]);
	});

	test("afterSuccess hook tracks responses-API JSON bodies (callModel path)", async () => {
		const { calls, autumn } = createAutumn();
		const { client } = createClient({});
		type Hook = {
			afterSuccess: (
				ctx: { operationID: string },
				response: Response,
			) => Response | Promise<Response>;
		};
		const hooks: Hook[] = [];
		const hookedClient = Object.assign(client, {
			_options: {
				hooks: { registerAfterSuccessHook: (hook: Hook) => hooks.push(hook) },
			},
		});

		withAutumn({ autumn, openRouter: hookedClient, customerId: "cus_123" });
		expect(hooks).toHaveLength(1);

		const body = {
			model: "openai/gpt-4o-mini",
			usage: {
				input_tokens: 12,
				input_tokens_details: { cached_tokens: 2 },
				output_tokens: 7,
				output_tokens_details: { reasoning_tokens: 3 },
				total_tokens: 19,
				cost: 0.001,
			},
		};
		// JSON captures are awaited by the hook, so tracking is settled here.
		await hooks[0]?.afterSuccess(
			{ operationID: "createResponses" },
			new Response(JSON.stringify(body), {
				headers: { "content-type": "application/json" },
			}),
		);
		// Ignored operation should not track.
		await hooks[0]?.afterSuccess(
			{ operationID: "listModels" },
			new Response(JSON.stringify(body), {
				headers: { "content-type": "application/json" },
			}),
		);

		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			inputTokens: 10,
			outputTokens: 4,
			cacheReadTokens: 2,
			reasoningTokens: 3,
			modelId: "openrouter/openai/gpt-4o-mini",
			properties: { openrouter_cost: 0.001 },
		});
	});

	test("afterSuccess hook tracks the final usage event of a responses SSE stream", async () => {
		const { calls, autumn } = createAutumn();
		const { client } = createClient({});
		type Hook = {
			afterSuccess: (
				ctx: { operationID: string },
				response: Response,
			) => Response | Promise<Response>;
		};
		const hooks: Hook[] = [];
		withAutumn({
			autumn,
			openRouter: Object.assign(client, {
				_options: {
					hooks: {
						registerAfterSuccessHook: (hook: Hook) => hooks.push(hook),
					},
				},
			}),
			customerId: "cus_123",
		});

		const sse = [
			'data: {"type":"response.output_text.delta","delta":"hi"}',
			'data: {"type":"response.completed","response":{"model":"openai/gpt-4o-mini","usage":{"input_tokens":5,"output_tokens":2,"total_tokens":7}}}',
			"data: [DONE]",
			"",
		].join("\n");
		hooks[0]?.afterSuccess(
			{ operationID: "createResponses" },
			new Response(sse, {
				headers: { "content-type": "text/event-stream" },
			}),
		);

		// Streaming captures are fire-and-forget; trackingSettled awaits them.
		await trackingSettled(client);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			inputTokens: 5,
			outputTokens: 2,
			modelId: "openrouter/openai/gpt-4o-mini",
		});
	});

	test("nested chatRequest body (@openrouter/sdk >= 0.12) gets usage forced and model resolved", async () => {
		const { calls, autumn } = createAutumn();
		const { client, requests } = createClient({ usage });

		const wrapped = withAutumn({
			autumn,
			openRouter: client,
			customerId: "cus_123",
		});
		await wrapped.chat.send({
			appTitle: "demo",
			chatRequest: { model: "openai/gpt-4o-mini", messages: [] },
		});

		const sent = requests[0] as {
			appTitle?: string;
			usage?: unknown;
			chatRequest?: { model?: string; usage?: unknown };
		};
		expect(sent.chatRequest?.usage).toEqual({ include: true });
		expect(sent.usage).toBeUndefined();
		expect(sent.appTitle).toBe("demo");
		expect(calls[0]?.modelId).toBe("openrouter/openai/gpt-4o-mini");
	});
});

describe("trackOpenRouterUsage", () => {
	test("tracks snake_case raw API usage and prefixes the model slug", async () => {
		const { calls, autumn } = createAutumn();

		await trackOpenRouterUsage({
			autumn,
			usage: {
				prompt_tokens: 13,
				completion_tokens: 7,
				prompt_tokens_details: { cached_tokens: 2, cache_write_tokens: 1 },
				completion_tokens_details: { reasoning_tokens: 2 },
				cost: 0.001,
			},
			model: "anthropic/claude-sonnet-4-5",
			customerId: "cus_123",
		});

		expect(calls[0]).toMatchObject({
			...expectedPools,
			modelId: "openrouter/anthropic/claude-sonnet-4-5",
			properties: { openrouter_cost: 0.001 },
		});
	});

	test("does not double-prefix an already-prefixed slug", async () => {
		const { calls, autumn } = createAutumn();

		await trackOpenRouterUsage({
			autumn,
			usage: { promptTokens: 1, completionTokens: 1 },
			model: "openrouter/openai/gpt-4o",
			customerId: "cus_123",
		});

		expect(calls[0]?.modelId).toBe("openrouter/openai/gpt-4o");
	});
});
