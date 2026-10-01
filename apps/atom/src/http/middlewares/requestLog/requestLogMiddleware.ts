import type { Context, ErrorHandler, MiddlewareHandler, Next } from "hono";
import type { AtomHttpContext, AtomHttpEnv } from "../../types/atomHttp.js";
import {
	carriesResponse,
	forwardedReason,
	isAtomsOwnFault,
	loggedErrorOf,
	requestFieldsOf,
	responseBodyOf,
} from "./requestLogLine.js";

/** Answered for a load balancer's probe every second; nothing to learn from it. */
const UNLOGGED_PATHS = new Set(["/health"]);

const toError = (cause: unknown): Error =>
	cause instanceof Error ? cause : new Error(String(cause));

/**
 * The outermost layer: every request leaves one line, `[status] METHOD path Nms`, with who it was
 * about, what came back and, when it failed, how. An error thrown below becomes its response here
 * first, so it is logged too. The line is built from the body already read and, for the few lines
 * that carry it, the response.
 */
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
				...requestFieldsOf({ body: context.get("body") }),
			},
			res: carriesResponse({ context })
				? await responseBodyOf({ context })
				: null,
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
