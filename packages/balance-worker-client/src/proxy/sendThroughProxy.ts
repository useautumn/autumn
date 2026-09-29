import { HttpResponseError } from "../http/types/httpClient.js";
import {
	assertRequestDeadline,
	createRequestDeadline,
} from "../routing/workerRequestPolicy.js";
import { BalanceWorkerClientError } from "../types/balanceWorkerClientErrors.js";
import { proxyErrorToClientError } from "./proxyErrors.js";
import {
	BALANCE_WORKER_PROXY_PATH,
	BALANCE_WORKER_PROXY_SIGNATURE_HEADER,
} from "./proxyProtocol.js";
import { signProxyBody } from "./proxySignature.js";
import type {
	BalanceWorkerProxyMethod,
	BalanceWorkerProxyParams,
	BalanceWorkerProxyReply,
	ProxySenderContext,
} from "./types/balanceWorkerProxy.js";

function readProxyReply({ body }: { body: unknown }): unknown {
	if (typeof body === "object" && body !== null) {
		if ("reply" in body) return body.reply;
		const error =
			"error" in body && proxyErrorToClientError({ error: body.error });
		if (error) throw error;
	}
	throw new BalanceWorkerClientError({
		code: "INVALID_RESPONSE",
		outcome: "unknown",
		message: "Balance worker proxy answered without a reply or an error",
	});
}

/** One signed POST to the API, which runs `method` on its own client. */
export async function sendThroughProxy<M extends BalanceWorkerProxyMethod>({
	ctx,
	method,
	params,
	signal,
}: {
	ctx: ProxySenderContext;
	method: M;
	params: BalanceWorkerProxyParams<M>;
	signal?: AbortSignal;
}): Promise<BalanceWorkerProxyReply<M>> {
	const deadline = createRequestDeadline({ timeoutMs: ctx.timeoutMs, signal });
	assertRequestDeadline({ deadline, outcome: "not_submitted" });
	const body = { method, params, caller: ctx.caller, sentAt: Date.now() };
	let responseBody: unknown;
	try {
		const response = await ctx.http.postJson({
			url: `${ctx.url}${BALANCE_WORKER_PROXY_PATH}`,
			body,
			// postJson sends JSON.stringify(body): the exact string signed here.
			headers: {
				[BALANCE_WORKER_PROXY_SIGNATURE_HEADER]: signProxyBody({
					secret: ctx.secret,
					rawBody: JSON.stringify(body),
				}),
			},
			signal: deadline.signal,
		});
		responseBody = response.body;
	} catch (cause) {
		assertRequestDeadline({ deadline, outcome: "unknown" });
		throw new BalanceWorkerClientError({
			code:
				cause instanceof HttpResponseError ? "INVALID_RESPONSE" : "TRANSPORT",
			outcome: "unknown",
			message: "Balance worker proxy request failed",
			cause,
		});
	}
	// The reply is the API client's own typed reply, relayed; `sendToOwner` trusts the worker the same way.
	return readProxyReply({ body: responseBody }) as BalanceWorkerProxyReply<M>;
}
