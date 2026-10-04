import type { Context, Next } from "hono";
import { RequestAbandonedError } from "../../runtime/deadlineShed/deadlineShedErrors.js";
import { isPastCallerDeadline } from "../../runtime/deadlineShed/isPastCallerDeadline.js";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

/** Arm B: a request its caller has already given up on is answered before its body is read. */
export async function callerDeadlineMiddleware(
	context: Context<BalanceWorkerHttpEnv>,
	next: Next,
): Promise<void> {
	if (isPastCallerDeadline({ headers: context.req.raw.headers }))
		throw new RequestAbandonedError();
	await next();
}
