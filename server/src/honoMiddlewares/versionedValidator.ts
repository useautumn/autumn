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

		// Select schema for user's version
		const versionKey = userVersion.value as ApiVersion;
		let schema = schemas[versionKey];

		// If version not found, find the closest matching version
		if (!schema) {
			// Get all defined versions (excluding 'latest'), sorted ascending (oldest first)
			const definedVersions = Object.keys(schemas)
				.filter((v) => v !== "latest")
				.map((v) => new ApiVersionClass(v as ApiVersion))
				.sort((a, b) => (a.lt(b) ? -1 : 1));

			// Find the first version that is >= user's version
			// If user is older than all versions, this returns the earliest
			// If user is between versions, this returns the next version
			for (const definedVersion of definedVersions) {
				if (userVersion.lte(definedVersion)) {
					schema = schemas[definedVersion.value as ApiVersion];
					break;
				}
			}

			// If no matching version found (user is newer than all), use latest
			if (!schema) {
				schema = schemas.latest;
			}
		}

		// Debug: log which schema version is being used
		// const schemaVersion = Object.entries(schemas).find(
		// 	([_, s]) => s === schema,
		// )?.[0];
		// console.log(
		// 	`[Validator] User version: ${userVersion.value}, Using schema: ${schemaVersion}`,
		// );

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
		} else if (target === "json") {
			// For JSON body, handle empty/null body gracefully
			let rawBody: unknown;
			try {
				rawBody = await c.req.json();
			} catch {
				// Empty or malformed body - treat as empty object
				rawBody = {};
			}

			// If body is null/undefined, default to empty object
			if (rawBody === null || rawBody === undefined) {
				rawBody = {};
			}

			const result = schema.safeParse(rawBody);
			if (!result.success) {
				throw result.error;
			}
			validatedData = result.data as Record<string, unknown>;
			c.req.addValidatedData(target, validatedData);
		} else {
			// For other targets (param, header, form), use zValidator
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
				ctx,
			});

			// Replace validated data with transformed version
			// This ensures handler always receives latest format
			c.req.addValidatedData(target, transformed);
		}

		await next();
	};
};
