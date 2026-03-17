import {
	type LanguageModel,
	type LanguageModelV1Middleware,
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
	featureId,
	entityId,
	properties,
}: {
	autumn: Autumn;
	model: LanguageModel;
	customerId: string;
	featureId?: string;
	entityId?: string;
	properties?: Record<string, unknown>;
}) => {
	const modelName =
		typeof model === "string" ? model : `${model.provider}/${model.modelId}`;

	const trackUsage = async (usage?: {
		promptTokens?: number;
		completionTokens?: number;
	}) => {
		if (!usage) return;

		try {
			// @ts-ignore Not pushed to prod yet, so this isn't found. remove once in sdk
			await autumn.balances.trackTokens({
				customerId,
				model: modelName,
				inputTokens: usage.promptTokens ?? 0,
				outputTokens: usage.completionTokens ?? 0,
				featureId,
				entityId,
				properties,
			});
		} catch (error) {
			// Catch errors so tracking failures don't break the main AI features
			console.error("[Autumn Tracking] Failed to track usage:", error);
		}
	};

	const middleware: LanguageModelV1Middleware = {
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