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
