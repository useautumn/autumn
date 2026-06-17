import { describe, expect, test } from "bun:test";
import type { LanguageModelV3, LanguageModelV3Usage } from "@ai-sdk/provider";
import { generateText, streamText } from "ai";
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

const usage: LanguageModelV3Usage = {
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

const createModel = (): LanguageModelV3 => ({
	specificationVersion: "v3",
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
