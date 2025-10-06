import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod/v4";
import type { MiddlewareHandler } from "hono";
import {
	ApiVersionClass,
	type ApiVersion,
	type AffectedResource,
	LATEST_VERSION,
	applyRequestVersionChanges,
} from "@autumn/shared";

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
		const schema = schemas[userVersion.value] ?? schemas.latest;

		// Validate with version-specific schema using zValidator
		const validatorMiddleware = zValidator(target, schema, (result, _c) => {
			if (!result.success) {
				// Validation errors reference fields from user's version ✅
				throw result.error;
			}
		});

		// Run validation
		await validatorMiddleware(c, async () => {});

		// Get validated data
		const validatedData = c.req.valid(target);

		// If user is on older version, transform to latest
		if (!userVersion.eq(new ApiVersionClass(LATEST_VERSION))) {
			const transformed = applyRequestVersionChanges({
				data: validatedData,
				targetVersion: userVersion,
				currentVersion: new ApiVersionClass(LATEST_VERSION),
				resource,
			});

			// Replace validated data with transformed version
			// This ensures handler always receives latest format
			c.req.addValidatedData(target, transformed);
		}

		await next();
	};
};
