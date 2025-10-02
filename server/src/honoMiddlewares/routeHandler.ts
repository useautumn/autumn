import type { Context, Env, Handler, MiddlewareHandler } from "hono";
import type { ZodType, z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { validator } from "./validatorMiddleware.js";

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
 * Create a type-safe route with validation that preserves full type inference!
 * By typing the context parameter, TypeScript knows what's available on c.req.valid()
 *
 * @example
 * ```ts
 * export const createProduct = createRoute({
 *   body: CreateProductParamsSchema,
 *   handler: async (c) => {
 *     const body = c.req.valid("json"); // ✅ Fully typed from schema!
 *     return c.json({ success: true });
 *   }
 * });
 *
 * // With query validation too:
 * export const listProducts = createRoute({
 *   query: ListProductsQuerySchema,
 *   handler: async (c) => {
 *     const query = c.req.valid("query"); // ✅ Fully typed!
 *     return c.json({ products: [] });
 *   }
 * });
 *
 * // In router:
 * honoProductRouter.post("", ...createProduct);
 * ```
 */
export function createRoute<
	Body extends ZodType | undefined = undefined,
	Query extends ZodType | undefined = undefined,
>(opts: {
	body?: Body;
	query?: Query;
	withTx?: boolean;
	handler: (
		c: ValidatedContext<HonoEnv, Body, Query>,
	) => Response | Promise<Response>;
}) {
	const middlewares: MiddlewareHandler[] = [];

	if (opts.body) {
		middlewares.push(validator("json", opts.body));
	}
	if (opts.query) {
		middlewares.push(validator("query", opts.query));
	}

	const wrappedHandler = async (c: ValidatedContext<HonoEnv, Body, Query>) => {
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
