import type { LanguageModelV3, LanguageModelV3Usage } from "@ai-sdk/provider";
import {
	type LanguageModelMiddleware,
	type LanguageModelUsage,
	wrapLanguageModel,
} from "ai";
import type { Autumn } from "autumn-js";

type TokenCount =
	| number
	| {
			total?: number | null;
	  }
	| null
	| undefined;

type TokenUsage = (LanguageModelV3Usage | LanguageModelUsage) & {
	promptTokens?: TokenCount;
	completionTokens?: TokenCount;
};

export const withTokenTracking = ({
	autumn,
	model,
	customerId,
	providerId,
	featureId,
	entityId,
	properties,
}: {
	/** Autumn SDK client instance. */
	autumn: Autumn;
	/** The AI SDK language model to wrap. */
	model: LanguageModelV3;
	/** The Autumn customer ID to attribute usage to. */
	customerId: string;
	/** Override the provider prefix used in the model name. Falls back to `model.provider`. */
	providerId?: "custom" | string;
	/** Target a specific AI credit system feature. Auto-detected if omitted. */
	featureId?: string;
	/** Entity ID for entity-scoped balance tracking. */
	entityId?: string;
	/** Additional properties to attach to the usage event. */
	properties?: Record<string, unknown>;
}) => {
	const provider = providerId ?? model.provider;
	const modelName = `${provider}/${model.modelId}`;

	const resolveTokens = (tokens: TokenCount, label: string): number => {
		const value = typeof tokens === "number" ? tokens : tokens?.total;
		if (value == null)
			throw new Error(
				`[Autumn] ${label} token usage was not returned by the model provider (${modelName}). This provider may not support usage tracking.`,
			);
		return value;
	};

	const trackUsage = async (usage: TokenUsage) => {
		try {
			// @ts-ignore trackTokens is generated from OpenAPI; local autumn-js types may not include it yet.
			await autumn.balances.trackTokens({
				customerId,
				modelId: modelName,
				inputTokens: resolveTokens(
					usage.inputTokens ?? usage.promptTokens,
					"Input",
				),
				outputTokens: resolveTokens(
					usage.outputTokens ?? usage.completionTokens,
					"Output",
				),
				featureId,
				entityId,
				properties,
			});
		} catch (error) {
			console.error("[Autumn Tracking] Failed to track usage:", error);
		}
	};

	const middleware: LanguageModelMiddleware = {
		specificationVersion: "v3",
		wrapGenerate: async ({ doGenerate }) => {
			const result = await doGenerate();
			await trackUsage(result.usage);
			return result;
		},
		wrapStream: async ({ doStream }) => {
			const { stream, ...rest } = await doStream();

			let trackingPromise: Promise<void> | undefined;

			type StreamChunk =
				typeof stream extends ReadableStream<infer T> ? T : never;

			const transformStream = new TransformStream<StreamChunk, StreamChunk>({
				transform(chunk, controller) {
					if (chunk.type === "finish" && chunk.usage) {
						trackingPromise = trackUsage(chunk.usage);
					}
					controller.enqueue(chunk);
				},
				async flush() {
					if (trackingPromise) {
						await trackingPromise;
					}
				},
			});

			return {
				stream: stream.pipeThrough(transformStream),
				...rest,
			};
		},
	};

	return wrapLanguageModel({ model: model, middleware });
};
