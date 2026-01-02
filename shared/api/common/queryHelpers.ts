import { z } from "zod/v4";

/**
 * Helper to handle query string arrays that can be either:
 * - Single value: ?expand=invoices → "invoices"
 * - Comma-separated: ?expand=invoices,rewards → ["invoices", "rewards"] (requires queryMiddleware)
 * - Multiple values: ?expand=invoices&expand=products → ["invoices", "products"]
 *
 * Normalizes all to array format for consistent Zod validation
 *
 * Note: Comma-separated parsing requires the queryMiddleware to be applied first.
 * The middleware uses the `qs` library to parse query strings with comma support.
 *
 * @example
 * ```ts
 * const schema = z.object({
 *   expand: queryStringArray(z.enum(CusExpand)).optional(),
 * });
 * ```
 */
export function queryStringArray<T extends z.ZodTypeAny>(schema: T) {
	return z.preprocess((val) => {
		// Convert single string to array for consistent handling
		if (typeof val === "string") {
			return [val];
		}
		return val;
	}, z.array(schema));
}

/**
 * Helper to handle query string integers that come in as strings and need to be converted to numbers.
 * Query parameters are always strings, so this helper parses them to integers for validation.
 *
 * @example
 * ```ts
 * const schema = z.object({
 *   limit: queryInteger({ min: 1, max: 100 }).default(10),
 *   offset: queryInteger({ min: 0 }).default(0),
 * });
 * ```
 */
/**
 * Helper to handle query string integer arrays that can be either:
 * - Single value: ?version=1 → [1]
 * - Comma-separated: ?version=1,2,3 → [1, 2, 3]
 * - Multiple values: ?version=1&version=2 → [1, 2]
 *
 * Parses string values to integers for consistent validation.
 */
export function queryIntegerArray() {
	return z.preprocess((val) => {
		if (typeof val === "number") {
			return [val];
		}
		if (typeof val === "string") {
			return val.split(",").map((v) => parseInt(v.trim(), 10));
		}
		if (Array.isArray(val)) {
			return val.map((v) => (typeof v === "string" ? parseInt(v, 10) : v));
		}
		return val;
	}, z.array(z.number().int()));
}

export function queryInteger(options?: {
	min?: number;
	max?: number;
	error?: string;
}) {
	let schema = z.number().int({ message: options?.error });

	if (options?.min !== undefined) {
		schema = schema.min(options.min, {
			message: options?.error || `must be at least ${options.min}`,
		});
	}

	if (options?.max !== undefined) {
		schema = schema.max(options.max, {
			message: options?.error || `must be at most ${options.max}`,
		});
	}

	return z.preprocess((val) => {
		// If already a number, return as-is
		if (typeof val === "number") {
			return val;
		}
		// Parse string to integer
		if (typeof val === "string") {
			const parsed = Number.parseInt(val, 10);
			return Number.isNaN(parsed) ? val : parsed;
		}
		return val;
	}, schema);
}
