import type { Context, Env, Handler, MiddlewareHandler } from "hono";
import type { ZodType, z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { validator } from "./validatorMiddleware.js";
import { versionedValidator } from "./versionedValidator.js";
import type { AffectedResource, ApiVersion } from "@autumn/shared";

/**
 * Extended context type that includes validated input
 * This tells TypeScript what data is available after validation
 */
type ValidatedContext<
	E extends Env,
	Body extends ZodType | undefined = undefined,
	Query extends ZodType | undefined = undefined,
> = Context<
	E,
	any,
	{
		in: {
			json: Body extends ZodType ? z.infer<Body> : unknown;
			query: Query extends ZodType ? z.infer<Query> : unknown;
		};
		out: {
			json: Body extends ZodType ? z.infer<Body> : unknown;
			query: Query extends ZodType ? z.infer<Query> : unknown;
		};
	}
>;

/**
 * Version-specific schemas configuration
 */
type VersionedSchemas<T extends ZodType> = Partial<Record<ApiVersion, ZodType>> & {
	latest: T; // Latest version schema (required)
};

/**
 * Create a type-safe route with validation that preserves full type inference!
 *
 * Supports two patterns:
 *
 * **Pattern 1: Single version (most endpoints)**
 * ```ts
 * export const createProduct = createRoute({
 *   body: CreateProductSchema,
 *   handler: async (c) => {
 *     const body = c.req.valid("json"); // ✅ Fully typed!
 *     return c.json({ success: true });
 *   }
 * });
 * ```
 *
 * **Pattern 2: Multiple versions (when API changed)**
 * ```ts
 * export const createProduct = createRoute({
 *   versionedBody: {
 *     latest: CreateProductV3Schema,  // Required
 *     [ApiVersion.V1_1]: CreateProductV2Schema,
 *     [ApiVersion.V0_2]: CreateProductV1Schema,
 *   },
 *   resource: AffectedResource.Product,
 *   handler: async (c) => {
 *     const body = c.req.valid("json"); // ✅ Always latest schema type!
 *     // Old versions auto-transformed to latest format
 *     return c.json({ success: true });
 *   }
 * });
 * ```
 */
export function createRoute<
	Body extends ZodType | undefined = undefined,
	Query extends ZodType | undefined = undefined,
>(opts: {
	body?: Body;
	versionedBody?: Body extends ZodType ? VersionedSchemas<Body> : never;
	query?: Query;
	versionedQuery?: Query extends ZodType ? VersionedSchemas<Query> : never;
	resource?: AffectedResource;
	withTx?: boolean;
	handler: (
		c: ValidatedContext<HonoEnv, Body, Query>,
	) => Response | Promise<Response>;
}) {
	const middlewares: MiddlewareHandler[] = [];

	// Use versioned validator if versionedBody provided
	if (opts.versionedBody && opts.resource) {
		middlewares.push(
			versionedValidator({
				target: "json",
				schemas: opts.versionedBody,
				resource: opts.resource,
			}),
		);
	} else if (opts.body) {
		// Fallback to regular validator for single-version endpoints
		middlewares.push(validator("json", opts.body));
	}

	// Same for query
	if (opts.versionedQuery && opts.resource) {
		middlewares.push(
			versionedValidator({
				target: "query",
				schemas: opts.versionedQuery,
				resource: opts.resource,
			}),
		);
	} else if (opts.query) {
		middlewares.push(validator("query", opts.query));
	}

	const wrappedHandler = async (c: ValidatedContext<HonoEnv, Body, Query>) => {
		c.set("validated", true);

		if (opts.withTx) {
			const db = c.get("ctx").db;

			return await db.transaction(async (tx) => {
				c.set("ctx", {
					...c.get("ctx"),
					db: tx as unknown as DrizzleCli,
				});
				return await opts.handler(c);
			});
		} else {
			return await opts.handler(c);
		}
	};

	return [...middlewares, wrappedHandler as Handler] as const;
}
