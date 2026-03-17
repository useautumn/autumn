import {
	type LanguageModel,
	type LanguageModelV1Middleware,
	wrapLanguageModel,
} from "ai";

interface AutumnClient {
	balances: {
		trackTokens(params: {
			customerId: string;
			model: string;
			inputTokens: number;
			outputTokens: number;
			featureId?: string;
			entityId?: string;
			properties?: Record<string, unknown>;
		}): Promise<unknown>;
	};
}

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
	autumn: AutumnClient;
	model: LanguageModel;
	customerId: string;
	featureId?: string;
	entityId?: string;
	properties?: Record<string, unknown>;
}) => {
	const modelName = `${model.provider}/${model.modelId}`;

	const trackUsage = ({
		promptTokens,
		completionTokens,
	}: {
		promptTokens: number;
		completionTokens: number;
	}) =>
		autumn.balances.trackTokens({
			customerId,
			model: modelName,
			inputTokens: promptTokens,
			outputTokens: completionTokens,
			featureId,
			entityId,
			properties,
		});

	const middleware: LanguageModelV1Middleware = {
		wrapGenerate: async ({ doGenerate }) => {
			const result = await doGenerate();
			await trackUsage(result.usage);
			return result;
		},
		wrapStream: async ({ doStream }) => {
			const { stream, ...rest } = await doStream();

			let trackingPromise: Promise<unknown> | undefined;

			const transformStream = new TransformStream<
				typeof stream extends ReadableStream<infer T> ? T : never,
				typeof stream extends ReadableStream<infer T> ? T : never
			>({
				transform(chunk, controller) {
					if (chunk.type === "finish") {
						trackingPromise = trackUsage(chunk.usage);
					}
					controller.enqueue(chunk);
				},
				async flush() {
					if (trackingPromise) await trackingPromise;
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
