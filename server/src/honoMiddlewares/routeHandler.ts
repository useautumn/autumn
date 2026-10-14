import {
	type AffectedResource,
	type ApiVersion,
	checkScopes,
	ErrCode,
	RecaseError,
	type RouteGroup,
	type RouteScopeRequirement,
} from "@autumn/shared";
import type { Context, Env, Next } from "hono";
import type { H } from "hono/types";
import type { ZodType, z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { acquireLock } from "@/external/redis/utils/lockUtils/acquireLock.js";
import { clearLock } from "@/external/redis/utils/lockUtils/clearLock.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { expandMiddleware } from "./expandMiddleware.js";
import { registerRouteGroup } from "./routeGroupRegistry.js";
import { validator } from "./validatorMiddleware.js";
import { versionedValidator } from "./versionedValidator.js";
import {
	assertVersionedKeyParity,
	resolveVersionedEntry,
} from "./versionResolver.js";

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

type VersionedSchemas<T extends ZodType> = Partial<
	Record<ApiVersion, ZodType>
> & {
	latest: T;
};

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

export const raceFailOpen = async ({
	run,
	timeoutMs,
	respond,
}: {
	run: () => Promise<Response>;
	timeoutMs: number;
	respond: () => Response | Promise<Response>;
}): Promise<Response> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const failOpen = new Promise<Response>((resolve) => {
		timer = setTimeout(
			() => resolve(Promise.resolve().then(respond)),
			timeoutMs,
		);
	});
	try {
		return await Promise.race([run(), failOpen]);
	} finally {
		clearTimeout(timer);
	}
};

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
	withTx?: boolean;
	handler?: (
		c: ValidatedContext<HonoEnv, Body, Query, Params>,
	) => Response | Promise<Response>;
	versionedHandler?: VersionedHandlerMap<TBodies, Query, Params>;
	assertIdempotence?: string | undefined;
	lock?: {
		getKey: (
			c: ValidatedContext<HonoEnv, Body, Query, Params>,
		) => string | null;
		ttlMs?: number;
		errorMessage?: string;
	};
	scopes: RouteScopeRequirement;
	routeGroup?: RouteGroup;
	failOpen?: {
		timeoutMs: number;
		skip?: (c: ValidatedContext<HonoEnv, Body, Query, Params>) => boolean;
		respond: (
			c: ValidatedContext<HonoEnv, Body, Query, Params>,
		) => Response | Promise<Response>;
	};
}): [H, ...H[]] {
	const middlewares: H[] = [];

	const scopeCheckMiddleware = async (c: Context<HonoEnv>, next: Next) => {
		if (c.req.path.startsWith("/webhooks/")) {
			return next();
		}

		const ctx = c.get("ctx");
		const granted = ctx.scopes;

		if (!granted || granted.length === 0) {
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

	if (opts.params) {
		middlewares.push(validator("param", opts.params));
	}

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
		const { failOpen } = opts;
		if (!failOpen || failOpen.skip?.(c)) return executeRoute(c);
		const timeoutMs =
			failOpen.timeoutMs - (Date.now() - c.get("ctx").timestamp);
		if (timeoutMs <= 0) return failOpen.respond(c);
		return raceFailOpen({
			run: () => executeRoute(c),
			timeoutMs,
			respond: () => failOpen.respond(c),
		});
	};

	const executeRoute = async (
		c: ValidatedContext<HonoEnv, Body, Query, Params>,
	) => {
		c.set("validated", true);

		const handler = pickHandler(c);

		let lockKey: string | null = null;
		let lockToken: string | null = null;
		if (opts.lock) {
			lockKey = opts.lock.getKey(c);
			if (lockKey) {
				lockToken = crypto.randomUUID();
				await acquireLock({
					lockKey,
					ttlMs: opts.lock.ttlMs,
					errorMessage: opts.lock.errorMessage,
					token: lockToken,
				});
			}
		}

		try {
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
		} finally {
			if (lockKey && lockToken) {
				await clearLock({ lockKey, token: lockToken });
			}
		}
	};

	if (opts.routeGroup) {
		registerRouteGroup({
			handler: wrappedHandler,
			routeGroup: opts.routeGroup,
		});
	}

	return [...middlewares, wrappedHandler as H] as unknown as [H, ...H[]];
}
