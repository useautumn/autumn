import { anthropic } from "@ai-sdk/anthropic";
import { leafSkillsFor, skillToText } from "@autumn/agent-docs/agent";
import { ErrCode, RecaseError } from "@autumn/shared";
import { generateObject, jsonSchema } from "ai";
import { z } from "zod/v4";
import type { GenerationContext } from "./generationContext";
import {
	type GenerateBillingTool,
	generationRegistry,
} from "./generationSchemas";

const GENERATION_MODEL = "claude-sonnet-5";

export type GenerationUsage = {
	cachedInputTokens: number;
	inputTokens: number;
	outputTokens: number;
};

/** The billing subagent's full skill bundle (billing + concepts, with
 * references inlined) — the same single source Leaf runs on. */
const SHARED_PARAM_DOCS = leafSkillsFor("billing")
	.map(skillToText)
	.join("\n\n");

/** Stable per tool — with the varying context in the user message, this whole
 * block (plus the tool schema) is a cacheable prompt prefix. */
export const buildSystemPrompt = (tool: GenerateBillingTool) => {
	const rules = [
		`You convert a natural-language billing request into structured parameters for Autumn's ${tool} operation, in one shot.`,
		generationRegistry[tool].promptFragment,
		SHARED_PARAM_DOCS,
		"IMPORTANT — one-shot overrides. The docs above are written for an interactive agent; you are not one. These rules take precedence over anything above:",
		"- You cannot ask questions and have no tools. Wherever the docs say to ask, clarify, or call a tool, decide yourself from the most literal reading of the request and produce the single best complete request. Never emit a partial or empty object.",
		"- Never omit a required field. Always set plan_id to your best match from the context plans; when sibling variants exist (e.g. monthly vs yearly), pick the one matching the stated interval or amount, defaulting to the monthly variant.",
		"- When the request states a price for a plan (e.g. 'at 10k/mo'), always set customize.price to it — including Enterprise/custom placeholder plans where the docs say to ask about the base price.",
		"- Use ONLY plan ids and feature ids that appear in the context below.",
		"- Monetary amounts are in major currency units (e.g. dollars). Never convert to cents.",
		"- The operation always targets the customer in the context. Ignore any other customer mentioned in the request.",
		"- Compute timestamps yourself from `now` in the context (epoch milliseconds).",
		"- Your output schema is a subset of the full billing params: invoice mode, redirect/checkout params, and the approval flow are handled by the system. Omit anything the schema does not define.",
		"- Free trials must set both duration_length and duration_type explicitly (e.g. a 14 day trial is duration_length 14, duration_type 'day').",
		"- Set only the fields the request asks for; unset fields may be omitted or set to JSON null.",
	];

	return rules.join("\n");
};

export const buildUserPrompt = ({
	prompt,
	contextJson,
	currentRequest,
	repairNote,
}: {
	prompt: string;
	contextJson: string;
	currentRequest?: Record<string, unknown>;
	repairNote?: string;
}) => {
	const parts = [`<context>\n${contextJson}\n</context>`];

	if (currentRequest) {
		parts.push(
			"The user is editing this existing request. Preserve every field of it that the prompt does not mention, and change only what the prompt asks for. Its field names may use an older dialect — map them onto the schema's field names (product_id -> plan_id; options -> feature_quantities; a top-level free_trial or items belong under customize, with free_trial using duration_length/duration_type):",
			JSON.stringify(currentRequest),
		);
	}

	parts.push(prompt);
	if (repairNote) parts.push(repairNote);
	return parts.join("\n\n");
};

/** Keys where JSON null is semantic (remove/clear) rather than "unset". */
const SEMANTIC_NULL_KEYS = new Set(["entity_id", "free_trial", "price"]);

const PLACEHOLDER_STRINGS = new Set(["null", "undefined", "{}", "[]"]);

const ENVELOPE_KEYS = new Set([
	"args",
	"arguments",
	"data",
	"input",
	"json",
	"object",
	"output",
	"parameters",
	"params",
	"payload",
	"request",
	"value",
]);

const decodeJsonString = (value: string): unknown => {
	const trimmed = value.trim();
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
	try {
		const parsed = JSON.parse(trimmed);
		return parsed !== null && typeof parsed === "object" ? parsed : value;
	} catch {
		return value;
	}
};

const stripUnsetPlaceholders = (value: unknown): unknown => {
	if (typeof value === "string") return decodeJsonString(value);
	if (Array.isArray(value)) return value.map(stripUnsetPlaceholders);
	if (value !== null && typeof value === "object") {
		const result: Record<string, unknown> = {};
		for (const [key, rawEntry] of Object.entries(value)) {
			let entry: unknown = rawEntry;
			if (typeof entry === "string" && PLACEHOLDER_STRINGS.has(entry)) continue;
			if (typeof entry === "string") entry = decodeJsonString(entry);
			if (
				entry !== null &&
				typeof entry === "object" &&
				!Array.isArray(entry)
			) {
				const nestedEntries = Object.entries(entry);
				if (
					nestedEntries[0] &&
					nestedEntries.length === 1 &&
					nestedEntries[0][0] === key
				) {
					entry = nestedEntries[0][1];
				}
			}
			if (entry === null && !SEMANTIC_NULL_KEYS.has(key)) continue;
			if (typeof entry === "string" && PLACEHOLDER_STRINGS.has(entry)) continue;
			result[key] = stripUnsetPlaceholders(entry);
		}
		return result;
	}
	return value;
};

/** Decodes common tool-call conventions before validation: a single envelope
 * key wrapping the real object, and null / "null" placeholders for unset
 * fields (the "every key present" structured-output convention). A lone
 * non-schema key can never validate against the strict schemas, so unwrapping
 * it is always safe. */
export const normalizeGeneratedValue = (
	value: unknown,
	schemaKeys?: ReadonlySet<string>,
): unknown => {
	let unwrapped = value;
	if (value !== null && typeof value === "object" && !Array.isArray(value)) {
		const entries = Object.entries(value);
		const [firstEntry] = entries;
		const isEnvelopeKey = (key: string) =>
			ENVELOPE_KEYS.has(key) || (schemaKeys ? !schemaKeys.has(key) : false);
		if (
			entries.length === 1 &&
			firstEntry &&
			isEnvelopeKey(firstEntry[0]) &&
			firstEntry[1] !== null &&
			typeof firstEntry[1] === "object" &&
			!Array.isArray(firstEntry[1])
		) {
			unwrapped = firstEntry[1];
		}
	}
	return stripUnsetPlaceholders(unwrapped);
};

/** Last-resort decode: the correct payload has always been INSIDE malformed
 * outputs (wrappers, stringified JSON), so search nested values for one that
 * validates rather than enumerating wrapper conventions. Bounded and ordered
 * shallowest-first; a strict-schema false positive is impossible because
 * acceptance IS validation. */
const salvageGeneratedValue = (
	value: unknown,
	parse: (candidate: unknown) => Record<string, unknown> | undefined,
	depth = 0,
): Record<string, unknown> | undefined => {
	if (depth > 4 || value === null || typeof value !== "object") {
		return undefined;
	}
	const nested = Array.isArray(value) ? value : Object.values(value);
	for (const candidateSource of nested) {
		const candidate =
			typeof candidateSource === "string"
				? decodeJsonString(candidateSource)
				: candidateSource;
		if (candidate === null || typeof candidate !== "object") continue;
		const parsed = parse(candidate);
		if (parsed) return parsed;
	}
	for (const candidateSource of nested) {
		const candidate =
			typeof candidateSource === "string"
				? decodeJsonString(candidateSource)
				: candidateSource;
		const parsed = salvageGeneratedValue(candidate, parse, depth + 1);
		if (parsed) return parsed;
	}
	return undefined;
};

/** The model-facing schema: the tool sees the real JSON schema, and validation
 * normalizes conventions before the authoritative zod parse. */
export const toGenerationOutputSchema = (
	schema: z.ZodType,
	stats?: { salvaged: boolean },
) => {
	const wireSchema = z.toJSONSchema(schema, {
		io: "input",
		reused: "ref",
		unrepresentable: "any",
	}) as { properties?: Record<string, unknown> };
	const schemaKeys = new Set(Object.keys(wireSchema.properties ?? {}));

	return jsonSchema<Record<string, unknown>>(
		wireSchema as Parameters<typeof jsonSchema>[0],
		{
			validate: (value) => {
				const parseCandidate = (candidate: unknown) => {
					const result = schema.safeParse(
						normalizeGeneratedValue(candidate, schemaKeys),
					);
					return result.success
						? (result.data as Record<string, unknown>)
						: undefined;
				};
				const direct = schema.safeParse(
					normalizeGeneratedValue(value, schemaKeys),
				);
				if (direct.success) {
					return {
						success: true,
						value: direct.data as Record<string, unknown>,
					};
				}
				const salvaged = salvageGeneratedValue(value, parseCandidate);
				if (salvaged) {
					if (stats) stats.salvaged = true;
					return { success: true, value: salvaged };
				}
				return { error: direct.error, success: false };
			},
		},
	);
};

/** Deepest cause first — that is where zod's issue list lives, and repair
 * feedback must not lose it to truncation behind a huge value dump. */
export const generationErrorMessage = (error: unknown): string => {
	if (!(error instanceof Error)) return String(error);
	const parts = [error.message];
	let cause: unknown = error.cause;
	for (let depth = 0; cause instanceof Error && depth < 3; depth++) {
		parts.push(cause.message);
		cause = cause.cause;
	}
	return parts.reverse().join(" — ").slice(0, 3000);
};

/** The pure LLM step: prompt + context -> params validated against the tool's
 * generation schema. One repair retry; `repaired` reports whether it was needed. */
export const generateBillingParams = async ({
	tool,
	prompt,
	context,
	currentRequest,
}: {
	tool: GenerateBillingTool;
	prompt: string;
	context: GenerationContext;
	currentRequest?: Record<string, unknown>;
}): Promise<{
	params: Record<string, unknown>;
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
		return result.object as Record<string, unknown>;
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
