import type { LanguageModelV3, LanguageModelV3Usage } from "@ai-sdk/provider";
import {
	type LanguageModelMiddleware,
	type LanguageModelUsage,
	wrapLanguageModel,
} from "ai";
// @ts-expect-error autumn-js types resolve in consuming projects; this package only needs the peer type.
import type { Autumn } from "autumn-js";

// Standalone published package: must not import from the internal @autumn/shared workspace.
const PROVIDER_SEPARATOR = "/";

type NestedCount = { total?: number | null } | null;

/**
 * Lenient view over the AI SDK usage shapes we accept: the nested
 * `LanguageModelV3Usage`, the flat `ai` `LanguageModelUsage` (with token details), and
 * legacy `promptTokens`/`completionTokens` objects.
 */
type AnyUsage = (LanguageModelV3Usage | LanguageModelUsage) & {
	promptTokens?: number | NestedCount;
	completionTokens?: number | NestedCount;
	inputTokenDetails?: {
		noCacheTokens?: number | null;
		cacheReadTokens?: number | null;
		cacheWriteTokens?: number | null;
	} | null;
	outputTokenDetails?: {
		textTokens?: number | null;
		reasoningTokens?: number | null;
	} | null;
	cachedInputTokens?: number | null;
	reasoningTokens?: number | null;
};

type ExclusivePools = {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	reasoningTokens: number;
};

const flatCount = (
	value: number | NestedCount | undefined,
): number | undefined => {
	if (typeof value === "number") return value;
	return value?.total ?? undefined;
};

export const withAutumn = ({
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
	const modelName = `${provider}${PROVIDER_SEPARATOR}${model.modelId}`;

	const required = (value: number | undefined, label: string): number => {
		if (value == null) {
			throw new Error(
				`[Autumn] ${label} token usage was not returned by the model provider (${modelName}). This provider may not support usage tracking.`,
			);
		}
		return value;
	};

	const normalizeUsage = (usage: AnyUsage): ExclusivePools => {
		const input = usage.inputTokens;
		const output = usage.outputTokens;

		if (input != null && typeof input === "object") {
			const cacheReadTokens = input.cacheRead ?? 0;
			const cacheWriteTokens = input.cacheWrite ?? 0;
			const textInput =
				input.noCache ??
				(input.total != null
					? input.total - cacheReadTokens - cacheWriteTokens
					: undefined);
			const out = typeof output === "object" ? output : null;
			const reasoningTokens = out?.reasoning ?? 0;
			const textOutput =
				out?.text ??
				(out?.total != null ? out.total - reasoningTokens : undefined);
			return {
				inputTokens: required(textInput, "Input"),
				outputTokens: required(textOutput, "Output"),
				cacheReadTokens: Math.max(0, cacheReadTokens),
				cacheWriteTokens: Math.max(0, cacheWriteTokens),
				reasoningTokens: Math.max(0, reasoningTokens),
			};
		}

		const inputDetails = usage.inputTokenDetails;
		const outputDetails = usage.outputTokenDetails;
		const cacheReadTokens =
			inputDetails?.cacheReadTokens ?? usage.cachedInputTokens ?? 0;
		const cacheWriteTokens = inputDetails?.cacheWriteTokens ?? 0;
		const reasoningTokens =
			outputDetails?.reasoningTokens ?? usage.reasoningTokens ?? 0;

		const rawInput =
			typeof input === "number" ? input : flatCount(usage.promptTokens);
		const textInput =
			inputDetails?.noCacheTokens ??
			(rawInput != null
				? rawInput - cacheReadTokens - cacheWriteTokens
				: undefined);

		const rawOutput =
			typeof output === "number" ? output : flatCount(usage.completionTokens);
		const textOutput =
			outputDetails?.textTokens ??
			(rawOutput != null ? rawOutput - reasoningTokens : undefined);

		return {
			inputTokens: Math.max(0, required(textInput, "Input")),
			outputTokens: Math.max(0, required(textOutput, "Output")),
			cacheReadTokens: Math.max(0, cacheReadTokens),
			cacheWriteTokens: Math.max(0, cacheWriteTokens),
			reasoningTokens: Math.max(0, reasoningTokens),
		};
	};

	const trackUsage = async (usage: AnyUsage) => {
		try {
			const pools = normalizeUsage(usage);
			// @ts-ignore trackTokens is generated from OpenAPI; local autumn-js types may not include it yet.
			await autumn.balances.trackTokens({
				customerId,
				modelId: modelName,
				inputTokens: pools.inputTokens,
				outputTokens: pools.outputTokens,
				cacheReadTokens: pools.cacheReadTokens,
				cacheWriteTokens: pools.cacheWriteTokens,
				reasoningTokens: pools.reasoningTokens,
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
			await trackUsage(result.usage as AnyUsage);
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
						trackingPromise = trackUsage(chunk.usage as AnyUsage);
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
