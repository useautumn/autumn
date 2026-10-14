import type { MiddlewareHandler } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

type ExpandCarrier = {
	expand?: string | string[];
	skip_cache?: boolean | string;
};

interface RequestWithValidation {
	valid(target: "query"): ExpandCarrier | undefined;
}

export const expandMiddleware = (): MiddlewareHandler<HonoEnv> => {
	const getRawBodyExpand = async ({
		c,
	}: {
		c: Parameters<MiddlewareHandler<HonoEnv>>[0];
	}) => {
		if (!["POST", "PUT", "PATCH"].includes(c.req.method)) {
			return undefined;
		}

		try {
			const body = (await c.req.json()) as ExpandCarrier | null;
			return body ?? undefined;
		} catch {
			return undefined;
		}
	};

	return async (c, next) => {
		const req = c.req as typeof c.req & RequestWithValidation;

		let validatedQuery: ExpandCarrier | undefined;
		try {
			validatedQuery = req.valid("query");
		} catch {
			validatedQuery = c.req.query() as ExpandCarrier | undefined;
		}

		const rawBody = await getRawBodyExpand({ c });

		const expandValue = rawBody?.expand ?? validatedQuery?.expand;
		const skipCacheQuery = rawBody?.skip_cache ?? validatedQuery?.skip_cache;

		const skipCacheValue =
			(typeof skipCacheQuery === "boolean" && skipCacheQuery === true) ||
			(typeof skipCacheQuery === "string" && skipCacheQuery === "true");

		const expand: string[] = !expandValue
			? []
			: Array.isArray(expandValue)
				? expandValue
				: [expandValue];

		const ctx = c.get("ctx");
		c.set("ctx", {
			...ctx,
			expand,
			skipCache: ctx.skipCache || skipCacheValue,
		});

		await next();
	};
};
