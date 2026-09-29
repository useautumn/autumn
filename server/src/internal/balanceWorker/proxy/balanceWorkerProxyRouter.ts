import { BALANCE_WORKER_PROXY_SIGNATURE_HEADER } from "@autumn/balance-worker-client";
import { getBalanceWorkerTransportEnv } from "@autumn/env/balanceWorkerClient";
import { type Context, Hono } from "hono";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { receiveProxyRequest } from "./receiveProxyRequest/receiveProxyRequest.js";

/** Null unless this API reaches the workers itself; a proxied API would forward the call back to itself. */
function readServingSecret(): string | null {
	const env = getBalanceWorkerTransportEnv();
	if (env.BALANCE_WORKER_TRANSPORT !== "direct") return null;
	return env.BALANCE_WORKER_PROXY_SECRET;
}

async function handleBalanceWorkerProxy(c: Context<HonoEnv>) {
	const response = await receiveProxyRequest({
		ctx: {
			client: getBalanceWorkerClient(),
			secret: readServingSecret(),
			logger: c.get("ctx").logger,
		},
		rawBody: await c.req.text(),
		signature: c.req.header(BALANCE_WORKER_PROXY_SIGNATURE_HEADER) ?? null,
	});
	return c.json(response.body, response.status);
}

export const balanceWorkerProxyRouter = new Hono<HonoEnv>();
balanceWorkerProxyRouter.post("/", handleBalanceWorkerProxy);
