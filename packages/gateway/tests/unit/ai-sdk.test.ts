import { describe, expect, test } from "bun:test";
import type { LanguageModelV4, LanguageModelV4Usage } from "@ai-sdk/provider";
import { generateText, isStepCount, jsonSchema, streamText, tool } from "ai";
import { withAutumn } from "../../src/ai-sdk/index.js";

type TrackTokensParams = {
	customerId: string;
	modelId: string;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens?: number;
	cacheWriteTokens?: number;
	reasoningTokens?: number;
	featureId?: string;
	entityId?: string;
	properties?: Record<string, unknown>;
};

const usage: LanguageModelV4Usage = {
	inputTokens: {
		total: 13,
		noCache: 10,
		cacheRead: 2,
		cacheWrite: 1,
	},
	outputTokens: {
		total: 7,
		text: 5,
		reasoning: 2,
	},
};

const finishReason = { unified: "stop" as const, raw: "stop" };

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

const createModel = (): LanguageModelV4 => ({
	specificationVersion: "v4",
	provider: "openai",
	modelId: "gpt-test",
	supportedUrls: {},
	async doGenerate() {
		return {
			content: [{ type: "text", text: "hello" }],
			finishReason,
			usage,
			warnings: [],
		};
	},
	async doStream() {
		return {
			stream: new ReadableStream({
				start(controller) {
					controller.enqueue({ type: "text-start", id: "text-1" });
					controller.enqueue({
						type: "text-delta",
						id: "text-1",
						delta: "hello",
					});
					controller.enqueue({ type: "text-end", id: "text-1" });
					controller.enqueue({ type: "finish", finishReason, usage });
					controller.close();
				},
			}),
		};
	},
});

describe("withAutumn", () => {
	for (const streaming of [false, true]) {
		for (const [provider, modelId, providerId, expected] of [
			["openai", "gpt-4.1", undefined, "openai/gpt-4.1"],
			["openai.chat", "gpt-4.1", undefined, "openai/gpt-4.1"],
			["openai.messages", "gpt-4.1", undefined, "openai/gpt-4.1"],
			["openai.responses", "gpt-4.1", undefined, "openai/gpt-4.1"],
			["openai.future.api", "gpt-4.1", undefined, "openai/gpt-4.1"],
			[
				"anthropic.messages",
				"claude-sonnet-4.6",
				undefined,
				"anthropic/claude-sonnet-4.6",
			],
			[
				"google.generative-ai",
				"gemini-2.5-pro",
				undefined,
				"google/gemini-2.5-pro",
			],
			[
				"gateway",
				"anthropic/claude-sonnet-4.6",
				undefined,
				"vercel/anthropic/claude-sonnet-4.6",
			],
			[
				"gateway.responses",
				"openai/gpt-4.1",
				undefined,
				"vercel/openai/gpt-4.1",
			],
			["vercel", "openai/gpt-4.1", undefined, "vercel/openai/gpt-4.1"],
			["openrouter", "openai/gpt-4.1", undefined, "openrouter/openai/gpt-4.1"],
			[
				"my.custom.provider",
				"nested/model.v1",
				undefined,
				"my.custom.provider/nested/model.v1",
			],
			[
				"openai-compatible.chat",
				"model.v1",
				undefined,
				"openai-compatible.chat/model.v1",
			],
			["openai.responses", "model.v1", "custom", "custom/model.v1"],
			[
				"openai.chat",
				"model.v1",
				"my.custom.provider",
				"my.custom.provider/model.v1",
			],
		] as const) {
			test(`resolves ${provider} with override ${providerId ?? "none"} (${streaming ? "streamText" : "generateText"})`, async () => {
				const { autumn, calls } = createAutumn();
				const model = withAutumn({
					autumn,
					customerId: "cus_provider",
					model: { ...createModel(), provider, modelId },
					providerId,
				});
				if (streaming) {
					await streamText({ model, prompt: "Hello" }).consumeStream();
				} else {
					await generateText({ model, prompt: "Hello" });
				}
				expect(calls).toHaveLength(1);
				expect(calls[0].modelId).toBe(expected);
				expect(model.provider).toBe(provider);
				expect(model.modelId).toBe(modelId);
			});
		}

		test(`tracks each tool-loop step exactly once (${streaming ? "streamText" : "generateText"})`, async () => {
			const { autumn, calls } = createAutumn();
			const base = createModel();
			const firstStepUsage: LanguageModelV4Usage = {
				inputTokens: { total: 26, noCache: 19, cacheRead: 3, cacheWrite: 4 },
				outputTokens: { total: 11, text: 8, reasoning: 3 },
			};
			let modelCalls = 0;
			const toolCall = {
				type: "tool-call" as const,
				toolCallId: "call_test",
				toolName: "lookup",
				input: "{}",
			};
			const toolFinishReason = {
				unified: "tool-calls" as const,
				raw: "tool_calls",
			};
			const model = withAutumn({
				autumn,
				customerId: "cus_steps",
				model: {
					...base,
					async doGenerate(params) {
						modelCalls++;
						if (modelCalls > 1) return base.doGenerate(params);
						return {
							content: [toolCall],
							finishReason: toolFinishReason,
							usage: firstStepUsage,
							warnings: [],
						};
					},
					async doStream(params) {
						modelCalls++;
						if (modelCalls > 1) return base.doStream(params);
						return {
							stream: new ReadableStream({
								start(controller) {
									controller.enqueue(toolCall);
									controller.enqueue({
										type: "finish",
										finishReason: toolFinishReason,
										usage: firstStepUsage,
									});
									controller.close();
								},
							}),
						};
					},
				},
			});
			const options = {
				model,
				prompt: "Look up a value, then say hello",
				stopWhen: isStepCount(2),
				tools: {
					lookup: tool({
						inputSchema: jsonSchema<Record<string, never>>({
							type: "object",
							properties: {},
							additionalProperties: false,
						}),
						execute: async () => "found",
					}),
				},
			};
			const result = streaming
				? streamText(options)
				: await generateText(options);
			if ("consumeStream" in result) await result.consumeStream();
			expect((await result.steps).length).toBe(2);
			expect((await result.usage).inputTokens).toBe(39);
			expect((await result.usage).outputTokens).toBe(18);
			expect(modelCalls).toBe(2);
			expect(calls).toEqual([
				{
					customerId: "cus_steps",
					modelId: "openai/gpt-test",
					inputTokens: 19,
					outputTokens: 8,
					cacheReadTokens: 3,
					cacheWriteTokens: 4,
					reasoningTokens: 3,
				},
				{
					customerId: "cus_steps",
					modelId: "openai/gpt-test",
					inputTokens: 10,
					outputTokens: 5,
					cacheReadTokens: 2,
					cacheWriteTokens: 1,
					reasoningTokens: 2,
				},
			]);
		});
	}

	test("tracks token usage from generateText", async () => {
		const { autumn, calls } = createAutumn();

		const model = withAutumn({
			autumn,
			model: createModel(),
			customerId: "cus_test",
			featureId: "ai_credits",
			entityId: "entity_test",
			properties: { source: "test" },
		});

		const result = await generateText({ model, prompt: "Say hello" });

		expect(result.text).toBe("hello");
		expect(calls).toEqual([
			{
				customerId: "cus_test",
				modelId: "openai/gpt-test",
				inputTokens: 10,
				outputTokens: 5,
				cacheReadTokens: 2,
				cacheWriteTokens: 1,
				reasoningTokens: 2,
				featureId: "ai_credits",
				entityId: "entity_test",
				properties: { source: "test" },
			},
		]);
	});

	test("tracks token usage from streamText when the stream finishes", async () => {
		const { autumn, calls } = createAutumn();

		const model = withAutumn({
			autumn,
			model: createModel(),
			customerId: "cus_stream",
			providerId: "custom-openai",
		});

		const result = streamText({ model, prompt: "Say hello" });
		const chunks: string[] = [];

		for await (const chunk of result.textStream) {
			chunks.push(chunk);
		}

		expect(chunks.join("")).toBe("hello");
		expect(calls).toEqual([
			{
				customerId: "cus_stream",
				modelId: "custom-openai/gpt-test",
				inputTokens: 10,
				outputTokens: 5,
				cacheReadTokens: 2,
				cacheWriteTokens: 1,
				reasoningTokens: 2,
			},
		]);
	});
});
