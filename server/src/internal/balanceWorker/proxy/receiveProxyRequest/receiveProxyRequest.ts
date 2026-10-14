import {
	type BalanceWorkerClient,
	type BalanceWorkerProxyRequest,
	type BalanceWorkerProxyResponse,
	type ClientLogger,
	errorToProxyError,
	isSignedBySecret,
} from "@autumn/balance-worker-client";
import { parseProxyRequest } from "./parseProxyRequest.js";
import { runProxyCall } from "./runProxyCall.js";

export type ProxyReceiverContext = {
	client: BalanceWorkerClient;
	secret: string | null;
	logger: ClientLogger;
};

function rejectProxyRequest({
	ctx,
	status,
	message,
	cause,
}: {
	ctx: ProxyReceiverContext;
	status: 400 | 401;
	message: string;
	cause?: unknown;
}): BalanceWorkerProxyResponse {
	ctx.logger.warn({ error: cause }, `[balance-worker-proxy] ${message}`);
	return {
		status,
		body: {
			error: { code: "PROXY_REJECTED", outcome: "not_submitted", message },
		},
	};
}

export async function receiveProxyRequest({
	ctx,
	rawBody,
	signature,
}: {
	ctx: ProxyReceiverContext;
	rawBody: string;
	signature: string | null;
}): Promise<BalanceWorkerProxyResponse> {
	const signed =
		ctx.secret !== null &&
		isSignedBySecret({ secret: ctx.secret, rawBody, signature });
	if (!signed)
		return rejectProxyRequest({
			ctx,
			status: 401,
			message: "Signature is invalid",
		});

	let request: BalanceWorkerProxyRequest;
	try {
		request = parseProxyRequest({ rawBody });
	} catch (cause) {
		return rejectProxyRequest({
			ctx,
			status: 400,
			message: "Request is invalid",
			cause,
		});
	}

	ctx.logger.info(
		{ data: { caller: request.caller, method: request.method } },
		"[balance-worker-proxy] Running call",
	);
	try {
		const reply = await runProxyCall({ client: ctx.client, call: request });
		return { status: 200, body: { reply: reply ?? null } };
	} catch (error) {
		return { status: 200, body: { error: errorToProxyError({ error }) } };
	}
}
