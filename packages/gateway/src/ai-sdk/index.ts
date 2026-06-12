import type { LanguageModelV3 } from "@ai-sdk/provider";
import { type LanguageModelMiddleware, wrapLanguageModel } from "ai";
import { type AutumnTrackingOptions, createTracker } from "../shared/track.js";
import { normalizeUsage, type UsageLike } from "./usage.js";

export type { AutumnClient, AutumnTrackingOptions } from "../shared/track.js";
export type { TokenPools } from "../shared/usage.js";
export type { UsageLike } from "./usage.js";

export type WithAutumnOptions = AutumnTrackingOptions & {
	/** The AI SDK language model to wrap. */
	model: LanguageModelV3;
	/** Override the provider prefix used in the model name (e.g. "openrouter", "custom"). Falls back to `model.provider`. */
	providerId?: string;
};

export const withAutumn = ({
	model,
	providerId,
	...tracking
}: WithAutumnOptions): LanguageModelV3 => {
	const modelName = `${providerId ?? model.provider}/${model.modelId}`;
	const track = createTracker(tracking);

	const trackUsage = (usage: UsageLike) =>
		track(() => ({
			pools: normalizeUsage(usage, modelName),
			modelId: modelName,
		}));

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
