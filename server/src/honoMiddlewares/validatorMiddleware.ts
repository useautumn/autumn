import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod/v4";

/**
 * Custom validator that wraps @hono/zod-validator with error throwing behavior
 * This allows the errorMiddleware to handle validation errors consistently
 * Maintains full type inference from zValidator
 *
 * For query validation, this uses the parsed query from queryMiddleware
 * to ensure boolean/array conversions are applied before validation
 *
 * For JSON validation, empty bodies are treated as {} to allow optional body schemas
 *
 * Usage:
 * ```ts
 * router.post(
 *   "/products",
 *   validator("json", CreateProductSchema),
 *   async (c) => {
 *     const body = c.req.valid("json"); // Fully typed!
 *     // ... handler logic
 *   }
 * );
 * ```
 */
export const validator = <T extends ZodType>(
	target: "json" | "query" | "param" | "header" | "form",
	schema: T,
) => {
	// For query validation, use the parsed query from queryMiddleware
	if (target === "query") {
		return async (c: any, next: any) => {
			const parsedQuery = c.req.query();
			const result = schema.safeParse(parsedQuery);
			if (!result.success) {
				throw result.error;
			}
			// Store validated data for c.req.valid("query")
			c.req.addValidatedData(target, result.data);
			await next();
		};
	}

	// Handle JSON body - allow empty body if schema allows it
	if (target === "json") {
		return async (c: any, next: any) => {
			let body: unknown;
			try {
				body = await c.req.json();
			} catch {
				// Empty body or whitespace-only body - default to empty object
				// Real JSON parse errors will still fail schema validation
				body = {};
			}

			const result = schema.safeParse(body);
			if (!result.success) {
				throw result.error;
			}
			c.req.addValidatedData(target, result.data);
			await next();
		};
	}

	return zValidator(target, schema, (result, _c) => {
		if (!result.success) {
			throw result.error;
		}
	});
};
