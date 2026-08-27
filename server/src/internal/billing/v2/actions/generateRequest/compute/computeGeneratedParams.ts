import { anthropic } from "@ai-sdk/anthropic";
import { ErrCode, RecaseError } from "@autumn/shared";
import { generateObject } from "ai";
import { generationErrorMessage } from "../errors/handleGenerationErrors";
import {
	type GenerateBillingTool,
	type GeneratedBillingParams,
	generationRegistry,
} from "../generationSchemas";
import type { GenerationContext } from "../setup/setupGenerationContext";
import { buildSystemPrompt, buildUserPrompt } from "./buildGenerationPrompts";
import { toGenerationOutputSchema } from "./decodeGeneratedValue";

const GENERATION_MODEL = "claude-sonnet-5";

export type GenerationUsage = {
	cachedInputTokens: number;
	inputTokens: number;
	outputTokens: number;
};

/** The pure LLM step: prompt + context -> params validated against the tool's
 * generation schema. One repair retry; `repaired` reports whether it was needed. */
export const computeGeneratedParams = async ({
	tool,
	prompt,
	context,
	currentRequest,
	validate,
}: {
	tool: GenerateBillingTool;
	prompt: string;
	context: GenerationContext;
	currentRequest?: Record<string, unknown>;
	validate?: (params: GeneratedBillingParams) => Promise<void> | void;
}): Promise<{
	params: GeneratedBillingParams;
	repaired: boolean;
	repairReason?: string;
	salvaged: boolean;
	usage?: GenerationUsage;
}> => {
	if (!process.env.ANTHROPIC_API_KEY) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message: "ANTHROPIC_API_KEY not configured",
			statusCode: 400,
		});
	}

	const entry = generationRegistry[tool];
	const system = buildSystemPrompt(tool);
	const contextJson = JSON.stringify(context);
	const decodeStats = { salvaged: false };

	const generate = async (repairNote?: string) => {
		const result = await generateObject({
			model: anthropic(GENERATION_MODEL),
			prompt: buildUserPrompt({
				contextJson,
				currentRequest,
				prompt,
				repairNote,
			}),
			// The billing param surface far exceeds the strict output-format
			// grammar's optional-parameter cap, so use classic tool-call JSON.
			// Request-level cache control caches the stable system + tool prefix.
			providerOptions: {
				anthropic: {
					cacheControl: { ttl: "1h", type: "ephemeral" },
					structuredOutputMode: "jsonTool",
				},
			},
			schema: toGenerationOutputSchema(entry.schema, decodeStats),
			system,
		});
		lastUsage = {
			cachedInputTokens: result.usage.cachedInputTokens ?? 0,
			inputTokens: result.usage.inputTokens ?? 0,
			outputTokens: result.usage.outputTokens ?? 0,
		};
		const params = result.object as GeneratedBillingParams;
		await validate?.(params);
		return params;
	};

	let lastUsage: GenerationUsage | undefined;

	try {
		return {
			params: await generate(),
			repaired: false,
			salvaged: decodeStats.salvaged,
			usage: lastUsage,
		};
	} catch (firstError) {
		const repairReason = generationErrorMessage(firstError);
		try {
			const params = await generate(
				`Your previous attempt failed validation: ${repairReason}. Return parameters that satisfy the schema, filling every required field with your best match from the context — never omit one.`,
			);
			return {
				params,
				repaired: true,
				repairReason,
				salvaged: decodeStats.salvaged,
				usage: lastUsage,
			};
		} catch (retryError) {
			throw new RecaseError({
				code: ErrCode.InvalidRequest,
				message: `Failed to generate a valid billing request: ${generationErrorMessage(retryError)}`,
				statusCode: 400,
			});
		}
	}
};
