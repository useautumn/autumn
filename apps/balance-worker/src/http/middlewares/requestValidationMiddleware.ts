import { parseWorkerRequest } from "@autumn/balance-worker-protocol";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

export async function requestValidationMiddleware(
	context: Context<BalanceWorkerHttpEnv>,
	next: Next,
): Promise<void> {
	const request = context.req.raw;
	if (
		request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
		"application/json"
	) {
		throw new HTTPException(400);
	}
	let input: unknown;
	try {
		input = await request.json();
	} catch (cause) {
		if (cause instanceof SyntaxError) throw new HTTPException(400, { cause });
		throw cause;
	}
	context.set("request", parseWorkerRequest({ input }));
	await next();
}
