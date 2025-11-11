import {
	type AffectedResource,
	type ApiVersion,
	ApiVersionClass,
	applyRequestVersionChanges,
	LATEST_VERSION,
} from "@autumn/shared";
import { zValidator } from "@hono/zod-validator";
import type { MiddlewareHandler } from "hono";
import type { ZodType } from "zod/v4";

/**
 * Version-aware validator middleware
 *
 * Flow:
 * 1. Determine user's API version from ctx.apiVersion
 * 2. Select appropriate schema for that version
 * 3. Validate data against version-specific schema (clear errors for their version)
 * 4. Transform validated data to latest format
 * 5. Store transformed data for handler
 *
 * @example
 * ```ts
 * router.post(
 *   "/products",
 *   versionedValidator({
 *     target: "json",
 *     schemas: {
 *       latest: CreateProductV3Schema,
 *       [ApiVersion.V1_1]: CreateProductV2Schema,
 *       [ApiVersion.V0_2]: CreateProductV1Schema,
 *     },
 *     resource: AffectedResource.Product,
 *   }),
 *   async (c) => {
 *     const body = c.req.valid("json"); // Always latest format!
 *   }
 * );
 * ```
 */
export const versionedValidator = ({
	target,
	schemas,
	resource,
}: {
	target: "json" | "query" | "param" | "header" | "form";
	schemas: Partial<Record<ApiVersion, ZodType>> & { latest: ZodType };
	resource: AffectedResource;
}): MiddlewareHandler => {
	return async (c, next) => {
		const ctx = c.get("ctx");
		const userVersion = ctx.apiVersion;

		// Select schema for user's version, fallback to latest
		const versionKey = userVersion.value as ApiVersion;
		const schema = schemas[versionKey] ?? schemas.latest;

		let validatedData: Record<string, unknown>;

		// For query validation, use the parsed query from queryMiddleware
		if (target === "query") {
			const parsedQuery = c.req.query();
			const result = schema.safeParse(parsedQuery);
			if (!result.success) {
				throw result.error;
			}
			validatedData = result.data as Record<string, unknown>;
			c.req.addValidatedData(target, validatedData);
		} else {
			// For other targets, use zValidator
			const validatorMiddleware = zValidator(target, schema, (result, _c) => {
				if (!result.success) {
					// Validation errors reference fields from user's version ✅
					throw result.error;
				}
			});

			// Run validation
			await validatorMiddleware(c, async () => {});

			// Get validated data - type assertion needed due to Hono's dynamic validation target typing
			validatedData = (c.req as any).valid(target) as Record<string, unknown>;
		}

		// If user is on older version, transform to latest
		if (!userVersion.eq(new ApiVersionClass(LATEST_VERSION))) {
			const transformed = applyRequestVersionChanges({
				input: validatedData,
				fromVersion: userVersion,
				toVersion: new ApiVersionClass(LATEST_VERSION),
				resource,
			});

			// Replace validated data with transformed version
			// This ensures handler always receives latest format
			c.req.addValidatedData(target, transformed);
		}

		await next();
	};
};
