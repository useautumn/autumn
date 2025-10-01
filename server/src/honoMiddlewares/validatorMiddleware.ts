import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod/v4";

/**
 * Custom validator that wraps @hono/zod-validator with error throwing behavior
 * This allows the errorMiddleware to handle validation errors consistently
 * Maintains full type inference from zValidator
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
	return zValidator(target, schema, (result, _c) => {
		if (!result.success) {
			throw result.error;
		}
	});
};
