import { jsonSchema } from "ai";
import { z } from "zod/v4";

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
