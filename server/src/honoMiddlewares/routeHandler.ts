import {
	type AffectedResource,
	type ApiVersion,
	checkScopes,
	ErrCode,
	RecaseError,
	type RouteScopeRequirement,
} from "@autumn/shared";
import type { Context, Env, Next } from "hono";
import type { H } from "hono/types";
import type { ZodType, z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { withLock } from "@/external/redis/redisUtils.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { expandMiddleware } from "./expandMiddleware.js";
import { validator } from "./validatorMiddleware.js";
import { versionedValidator } from "./versionedValidator.js";
import {
	assertVersionedKeyParity,
	resolveVersionedEntry,
} from "./versionResolver.js";

/**
 * Extended context type that includes validated input
 * This tells TypeScript what data is available after validation
 */
type ValidatedContext<
	E extends Env,
	Body extends ZodType | undefined = undefined,
	Query extends ZodType | undefined = undefined,
	Params extends ZodType | undefined = undefined,
> = Context<
	E,
	any,
	{
		in: {
			json: Body extends ZodType ? z.infer<Body> : unknown;
			query: Query extends ZodType ? z.infer<Query> : unknown;
			param: Params extends ZodType ? z.infer<Params> : unknown;
		};
		out: {
			json: Body extends ZodType ? z.infer<Body> : unknown;
			query: Query extends ZodType ? z.infer<Query> : unknown;
			param: Params extends ZodType ? z.infer<Params> : unknown;
		};
	}
>;

/**
 * Version-specific schemas configuration
 */
type VersionedSchemas<T extends ZodType> = Partial<
	Record<ApiVersion, ZodType>
> & {
	latest: T; // Latest version schema (required)
};

/**
 * Per-version handler map paired with a `versionedBody`. Each handler receives
 * the body validated against its own version's schema — no forward transform.
 * Keys MUST match the `versionedBody` keys exactly (enforced at registration).
 */
type VersionedHandlerMap<
	TBodies extends { latest: ZodType } & Partial<Record<ApiVersion, ZodType>>,
	Query extends ZodType | undefined,
	Params extends ZodType | undefined,
> = {
	[K in keyof TBodies]: TBodies[K] extends ZodType
		? (
				c: ValidatedContext<HonoEnv, TBodies[K], Query, Params>,
			) => Response | Promise<Response>
		: never;
};

/**
 * Create a type-safe route with validation that preserves full type inference!
 *
 * Supports validation for body, query, and params:
 *
 * **Pattern 1: Single version (most endpoints)**
 * ```ts
 * export const createProduct = createRoute({
 *   body: CreateProductSchema,
 *   query: ProductQuerySchema,
 *   params: ProductParamsSchema,
 *   handler: async (c) => {
 *     const body = c.req.valid("json");   // ✅ Fully typed!
 *     const query = c.req.valid("query"); // ✅ Fully typed!
 *     const params = c.req.param(); // ✅ Fully typed!
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
	Params extends ZodType | undefined = undefined,
	TBodies extends { latest: ZodType } & Partial<
		Record<ApiVersion, ZodType>
	> = never,
>(opts: {
	body?: Body;
	versionedBody?: Body extends ZodType
		? TBodies & VersionedSchemas<Body>
		: never;
	query?: Query;
	versionedQuery?: Query extends ZodType ? VersionedSchemas<Query> : never;
	params?: Params;
	resource?: AffectedResource;
	/** Be VERY careful — wraps the ENTIRE handler in a txn; bad for handlers that call Stripe (writes aren't visible until response returns). */
	withTx?: boolean;
	handler?: (
		c: ValidatedContext<HonoEnv, Body, Query, Params>,
	) => Response | Promise<Response>;
	/**
	 * Per-version handlers paired with `versionedBody`. When set, each handler
	 * receives the body in its own version's shape (no forward transform).
	 * Keys must match `versionedBody` keys exactly — enforced at registration.
	 */
	versionedHandler?: VersionedHandlerMap<TBodies, Query, Params>;
	assertIdempotence?: string | undefined;
	/** Lock configuration to prevent concurrent requests */
	lock?: {
		/** Generate a lock key. Returns null to skip locking. */
		getKey: (
			c: ValidatedContext<HonoEnv, Body, Query, Params>,
		) => string | null;
		/** Lock TTL in milliseconds (default: 10000) */
		ttlMs?: number;
		/** Error message to show when lock is already held */
		errorMessage?: string;
		/** Whether configured Redis failures may proceed without a lock. */
		failOpen?: boolean;
	};
	/**
	 * Required auth scopes for this route. See `RouteScopeRequirement`.
	 * Accepts a plain array (ALL semantics) or `{ ANY | ALL | ANY, ALL }`.
	 * Use `Scopes.Public` to declare a route needs no scopes (public
	 * endpoints, authed-but-ungated routes, etc).
	 */
	scopes: RouteScopeRequirement;
}): [H, ...H[]] {
	const middlewares: H[] = [];

	/**
	 * Scope-check middleware — runs before validators/expand/body so we
	 * fail-fast on unauthorised requests without wasting CPU parsing a
	 * payload we'll reject.
	 */
	const scopeCheckMiddleware = async (c: Context<HonoEnv>, next: Next) => {
		// Webhooks authenticate via signed payloads from external services
		// (Stripe, Vercel, RevenueCat, etc.). They have no bearer token and
		// no session, so ctx.scopes is never populated. Bypass the scope
		// check unconditionally for any request under /webhooks/*.
		if (c.req.path.startsWith("/webhooks/")) {
			return next();
		}

		const ctx = c.get("ctx");
		const granted = ctx.scopes;

		// Legacy fail-open: no scopes on key/session ⇒ allow with warning.
		// Covers:
		//   - Legacy API keys created before the scopes column existed
		//   - Public keys (by design bypass the scope system)
		//   - Cached API key payloads from before the deploy
		if (!granted || granted.length === 0) {
			// ctx.logger?.warn("Scope check skipped: no scopes on request auth", {
			// 	path: c.req.path,
			// 	method: c.req.method,
			// 	required: opts.scopes,
			// 	authType: ctx.authType,
			// });
			return next();
		}

		const { allowed, missing } = checkScopes(opts.scopes, granted);
		if (!allowed) {
			throw new RecaseError({
				message: `Insufficient scopes. Missing: ${missing.join(", ")}`,
				code: ErrCode.InsufficientScopes,
				statusCode: 403,
			});
		}
		return next();
	};
	middlewares.push(scopeCheckMiddleware);

	// Query validation runs before expand so ctx.expand can keep using validated query data.
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

	// Params validator (no versioned variant)
	if (opts.params) {
		middlewares.push(validator("param", opts.params));
	}

	// Expand reads query from validated data and body from raw JSON before body validation.
	if (opts.query || opts.versionedQuery || opts.body || opts.versionedBody) {
		middlewares.push(expandMiddleware());
	}

	if (opts.versionedHandler) {
		if (!opts.versionedBody) {
			throw new Error(
				"createRoute: `versionedHandler` requires `versionedBody`. Provide both or neither.",
			);
		}
		assertVersionedKeyParity({
			a: opts.versionedBody as Record<string, unknown> & { latest: unknown },
			b: opts.versionedHandler as Record<string, unknown> & {
				latest: unknown;
			},
			aName: "versionedBody",
			bName: "versionedHandler",
		});
	}

	if (!opts.handler && !opts.versionedHandler) {
		throw new Error(
			"createRoute: must provide either `handler` or `versionedHandler`.",
		);
	}

	// Body validation runs after expand so body-based expand does not depend on Zod parsing.
	if (opts.versionedBody && opts.resource) {
		middlewares.push(
			versionedValidator({
				target: "json",
				schemas: opts.versionedBody,
				resource: opts.resource,
				transformToLatest: !opts.versionedHandler,
			}),
		);
	} else if (opts.body) {
		middlewares.push(validator("json", opts.body));
	}

	const pickHandler = (
		c: ValidatedContext<HonoEnv, Body, Query, Params>,
	): ((
		c: ValidatedContext<HonoEnv, Body, Query, Params>,
	) => Response | Promise<Response>) => {
		if (opts.versionedHandler) {
			const resolved = resolveVersionedEntry({
				map: opts.versionedHandler as Record<string, unknown> & {
					latest: unknown;
				},
				requested: c.get("ctx").apiVersion,
			});
			return resolved as (
				c: ValidatedContext<HonoEnv, Body, Query, Params>,
			) => Response | Promise<Response>;
		}
		if (!opts.handler) {
			throw new Error("createRoute: no handler resolved for this route.");
		}
		return opts.handler;
	};

	const wrappedHandler = async (
		c: ValidatedContext<HonoEnv, Body, Query, Params>,
	) => {
		c.set("validated", true);

		const handler = pickHandler(c);

		const executeHandler = async () => {
			if (opts.withTx) {
				const db = c.get("ctx").db;

				return await db.transaction(async (tx) => {
					c.set("ctx", {
						...c.get("ctx"),
						db: tx as unknown as DrizzleCli,
					});
					return await handler(c);
				});
			} else {
				return await handler(c);
			}
		};

		if (!opts.lock) return executeHandler();
		const lockKey = opts.lock.getKey(c);
		if (!lockKey) return executeHandler();

		return withLock({
			lockKey,
			ttlMs: opts.lock.ttlMs,
			errorMessage: opts.lock.errorMessage,
			failOpen: opts.lock.failOpen,
			fn: executeHandler,
		});
	};

	return [...middlewares, wrappedHandler as H] as unknown as [H, ...H[]];
}
