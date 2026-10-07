import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import type { Context, ErrorHandler, MiddlewareHandler, Next } from "hono";
import type { AtomHttpContext, AtomHttpEnv } from "../../types/atomHttp.js";
import {
	forwardedReason,
	isAtomsOwnFault,
	loggedErrorOf,
	loggedResponseOf,
	requestFieldsOf,
} from "./requestLogLine.js";

/** Answered for a load balancer's probe every second; nothing to learn from it. */
const UNLOGGED_PATHS = new Set(["/health"]);
/** What the thread counts for /health, by route. */
const COUNTED_PATHS = {
	"/v1/balances.check": "checks",
	"/v1/subjects.set": "pushes",
	"/v1/catalog.set": "pushes",
} as const;

const toError = (cause: unknown): Error =>
	cause instanceof Error ? cause : new Error(String(cause));

/** The outermost layer: one line per request, `[status] METHOD path Nms`, with who it was about, what came back and how it
 * failed. Allowed checks, most of the traffic, are only sampled, and say at what rate; denies and failures are all kept. */
export function requestLogMiddleware({
	ctx,
	handleError,
}: {
	ctx: AtomHttpContext;
	handleError: ErrorHandler<AtomHttpEnv>;
}): MiddlewareHandler<AtomHttpEnv> {
	async function logRequest(context: Context<AtomHttpEnv>, next: Next) {
		const startedAt = Date.now();
		try {
			await next();
		} catch (cause) {
			context.res = await handleError(toError(cause), context);
		}
		if (UNLOGGED_PATHS.has(context.req.path)) return;
		const counted =
			COUNTED_PATHS[context.req.path as keyof typeof COUNTED_PATHS];
		if (counted) ctx.counters.add(counted);
		const verdict = context.get("verdict");
		if (verdict) ctx.checkCounts.add(verdict);
		if (verdict?.allowed && Math.random() >= ctx.allowLogSampleRate) return;

		const statusCode = context.res.status;
		const durationMs = Date.now() - startedAt;
		const forwarded = forwardedReason({ context });
		const failure = context.get("failure");
		const line = {
			statusCode,
			durationMs,
			req: {
				method: context.req.method,
				path: context.req.path,
				...requestFieldsOf({
					body: context.get("body"),
					routedCustomerId: context.req.header(ATOM_CUSTOMER_ID_HEADER),
				}),
			},
			res: await loggedResponseOf({ context }),
			...(verdict?.allowed && { sample_rate: ctx.allowLogSampleRate }),
			...(forwarded && { forwarded }),
			...(failure && {
				errorCode: failure.code,
				error: loggedErrorOf({ error: failure.error, statusCode }),
				...(failure.target && { data: { target: failure.target } }),
			}),
		};
		const message = `[${statusCode}] ${context.req.method} ${context.req.path} ${durationMs}ms${forwarded ? ` → Autumn API (${forwarded})` : ""}${failure ? ` — ${failure.code}: ${failure.error.message}` : ""}`;
		if (isAtomsOwnFault({ statusCode })) ctx.logger.error(line, message);
		// A public endpoint is scanned all day; a path Atom does not serve is not worth a warning.
		else if (statusCode >= 400 && statusCode !== 404)
			ctx.logger.warn(line, message);
		else ctx.logger.info(line, message);
	}
	return logRequest;
}
