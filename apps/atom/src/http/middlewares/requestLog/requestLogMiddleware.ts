import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import type { Context, ErrorHandler, MiddlewareHandler, Next } from "hono";
import { logOrg } from "../../../lib/logging/getAtomLogger.js";
import { PROXIED_HEADER } from "../../forward/hopToPeer.js";
import type { AtomHttpContext, AtomHttpEnv } from "../../types/atomHttp.js";
import { countRequest } from "./countRequest.js";
import {
	forwardedReason,
	isAtomsOwnFault,
	loggedErrorOf,
	loggedResponseOf,
	requestContextOf,
	requestFieldsOf,
} from "./requestLogLine.js";

/** Answered for a load balancer's probe every second; nothing to learn from it. */
const UNLOGGED_PATHS = new Set(["/health"]);
/** A line per allowed check costs a saturated Atom about an eighth of its capacity, so 1 in 100 is kept; denies all are. */
const ALLOWED_CHECK_SAMPLE_RATE = 0.01;
/** Autumn's pushes run at a third of the checks and each is counted in /health, so a stored one is only sampled too; so is a
 *  check answered by the owner it hopped to, which logs the answer itself (on staging at 1.6k rps the hops were 72 % of the lines). */
const PUSH_PATHS = new Set(["/v1/subjects.set", "/v1/catalog.set"]);
/** A thread's first allowed checks are all logged, so the dashboard can show an org its first checks arriving. */
export const FIRST_ALLOWED_CHECKS_LOGGED = 10;

const toError = (cause: unknown): Error =>
	cause instanceof Error ? cause : new Error(String(cause));

/** The outermost layer: one line per request, `[status] METHOD path Nms`, with who it was about, what came back and how it
 * failed. Allowed checks past a thread's first few and stored pushes, most of the traffic, are only sampled and say at what rate; denies and failures are all kept. */
export function requestLogMiddleware({
	ctx,
	handleError,
}: {
	ctx: AtomHttpContext;
	handleError: ErrorHandler<AtomHttpEnv>;
}): MiddlewareHandler<AtomHttpEnv> {
	let allowedChecks = 0;

	async function logRequest(context: Context<AtomHttpEnv>, next: Next) {
		const startedAt = Date.now();
		try {
			await next();
		} catch (cause) {
			context.res = await handleError(toError(cause), context);
		}
		if (UNLOGGED_PATHS.has(context.req.path)) return;
		const statusCode = context.res.status;
		const forwarded = forwardedReason({ context });
		countRequest({
			counters: ctx.counters,
			path: context.req.path,
			statusCode,
			forwarded: forwarded !== undefined,
		});
		const allowed = context.get("allowed") === true;
		if (allowed) allowedChecks++;
		const isStoredPush = PUSH_PATHS.has(context.req.path) && statusCode < 300;
		// The owner the check hopped to logs its answer itself, allow or deny; this replica's line is only the hop.
		const isHopAnswered =
			context.res.headers.has(PROXIED_HEADER) && statusCode < 300;
		const sampled =
			(allowed && allowedChecks > FIRST_ALLOWED_CHECKS_LOGGED) ||
			isStoredPush ||
			isHopAnswered;
		if (sampled && Math.random() >= ALLOWED_CHECK_SAMPLE_RATE) return;

		const durationMs = Date.now() - startedAt;
		const failure = context.get("failure");
		const idempotencyKey = context.get("idempotencyKey");
		const fields = requestFieldsOf({
			body: context.get("body"),
			routedCustomerId: context.req.header(ATOM_CUSTOMER_ID_HEADER),
		});
		const line = {
			statusCode,
			durationMs,
			context: requestContextOf({ context, org: logOrg(), fields }),
			req: {
				id: context.get("requestId"),
				method: context.req.method,
				path: context.req.path,
				...fields,
				// A deduction's key at Autumn is this when present, the request id otherwise.
				...(idempotencyKey && { idempotencyKey }),
			},
			res: await loggedResponseOf({ context }),
			...(sampled && { sample_rate: ALLOWED_CHECK_SAMPLE_RATE }),
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
