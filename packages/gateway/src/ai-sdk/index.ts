import type { LanguageModelV3 } from "@ai-sdk/provider";
import { type LanguageModelMiddleware, wrapLanguageModel } from "ai";
import { type AutumnClient, trackTokenUsage } from "../shared/track.js";
import { normalizeUsage, type UsageLike } from "./usage.js";

export type { AutumnClient } from "../shared/track.js";
export type { TokenPools } from "../shared/usage.js";
export type { UsageLike } from "./usage.js";

export type WithAutumnOptions = {
	/** Autumn SDK client instance. */
	autumn: AutumnClient;
	/** The AI SDK language model to wrap. */
	model: LanguageModelV3;
	/** The Autumn customer ID to attribute usage to. */
	customerId: string;
	/** Override the provider prefix used in the model name (e.g. "openrouter", "custom"). Falls back to `model.provider`. */
	providerId?: string;
	/** Target a specific AI credit system feature. Auto-detected if omitted. */
	featureId?: string;
	/** Entity ID for entity-scoped balance tracking. */
	entityId?: string;
	/** Additional properties to attach to each usage event. */
	properties?: Record<string, unknown>;
};

export const withAutumn = ({
	autumn,
	model,
	customerId,
	providerId,
	featureId,
	entityId,
	properties,
}: WithAutumnOptions): LanguageModelV3 => {
	const modelName = `${providerId ?? model.provider}/${model.modelId}`;

	const trackUsage = (usage: UsageLike) =>
		trackTokenUsage({
			autumn,
			getParams: () => ({
				...normalizeUsage(usage, modelName),
				customerId,
				modelId: modelName,
				featureId,
				entityId,
				properties,
			}),
		});

	const middleware: LanguageModelMiddleware = {
		specificationVersion: "v3",
		wrapGenerate: async ({ doGenerate }) => {
			const result = await doGenerate();
			await trackUsage(result.usage as UsageLike);
			return result;
		},
		wrapStream: async ({ doStream }) => {
			const { stream, ...rest } = await doStream();

			let trackingPromise: Promise<void> | undefined;

			type StreamChunk = typeof stream extends ReadableStream<infer T>
				? T
				: never;

			const transformStream = new TransformStream<StreamChunk, StreamChunk>({
				transform(chunk, controller) {
					if (chunk.type === "finish" && chunk.usage) {
						trackingPromise = trackUsage(chunk.usage as UsageLike);
					}
					controller.enqueue(chunk);
				},
				async flush() {
					await trackingPromise;
				},
			});

			return {
				stream: stream.pipeThrough(transformStream),
				...rest,
			};
		},
	};

	return wrapLanguageModel({ model, middleware });
};
