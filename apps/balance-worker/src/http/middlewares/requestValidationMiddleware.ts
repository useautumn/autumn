import { parseWorkerRequest } from "@autumn/balance-worker-client/protocol";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

/** The request body as JSON; anything else is a 400 before routing. */
export async function readJsonRequestBody(
	context: Context<BalanceWorkerHttpEnv>,
): Promise<unknown> {
	const request = context.req.raw;
	if (
		request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
		"application/json"
	) {
		throw new HTTPException(400);
	}
	try {
		return await request.json();
	} catch (cause) {
		if (cause instanceof SyntaxError) throw new HTTPException(400, { cause });
		throw cause;
	}
}

export async function requestValidationMiddleware(
	context: Context<BalanceWorkerHttpEnv>,
	next: Next,
): Promise<void> {
	const input = await readJsonRequestBody(context);
	context.set("request", parseWorkerRequest({ input }));
	await next();
}
