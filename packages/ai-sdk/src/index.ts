import type { LanguageModelV3, LanguageModelV3Usage } from "@ai-sdk/provider";
import {
	type LanguageModelMiddleware,
	type LanguageModelUsage,
	wrapLanguageModel,
} from "ai";
import type { Autumn } from "autumn-js";

/**
 * Wraps an AI SDK model with automatic Autumn token tracking.
 * Every generate or stream call will report usage to Autumn.
 */
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
	/** Override the provider prefix used in the model name sent to Autumn. Falls back to `model.provider`. */
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

	const resolveTokens = (
		tokens: number | { total?: number | undefined } | undefined,
		label: string,
	): number => {
		if (tokens == null)
			throw new Error(
				`[Autumn] ${label} token usage was not returned by the model provider (${modelName}). This provider may not support usage tracking.`,
			);
		if (typeof tokens === "number") return tokens;
		if (tokens.total == null)
			throw new Error(
				`[Autumn] ${label} token usage total was not returned by the model provider (${modelName}). This provider may not support usage tracking.`,
			);
		return tokens.total;
	};

	const trackUsage = async (
		usage: LanguageModelV3Usage | LanguageModelUsage,
	) => {
		try {
			await autumn.balances.trackTokens({
				customerId,
				modelId: modelName,
				inputTokens: resolveTokens(usage.inputTokens, "Input"),
				outputTokens: resolveTokens(usage.outputTokens, "Output"),
				featureId,
				entityId,
				properties,
			});
		} catch (error) {
			// Catch errors so tracking failures don't break the main AI features
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

			const transformStream = new TransformStream<
				typeof stream extends ReadableStream<infer T> ? T : never,
				typeof stream extends ReadableStream<infer T> ? T : never
			>({
				transform(chunk, controller) {
					// Defensively check for usage
					if (chunk.type === "finish" && chunk.usage) {
						trackingPromise = trackUsage(chunk.usage);
					}
					controller.enqueue(chunk);
				},
				async flush() {
					// Await the tracking to keep serverless contexts alive
					// until the network request to Autumn completes
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
