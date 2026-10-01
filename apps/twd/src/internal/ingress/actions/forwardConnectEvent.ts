import type { TwdLogger } from "../../../lib/logger.ts";
import {
	getIngressRoute,
	getShardRoute,
	isIngressAccountDropped,
} from "./ingressRoutes.ts";

const FORWARDED_HEADERS = ["content-type", "stripe-signature", "user-agent"];

/** Port of scripts/tw/ingress/server.mjs forwardConnectEvent: the worker owns the ack status. */
export const forwardConnectEvent = async ({
	rawBody,
	headers,
	env,
	shard,
	logger,
}: {
	rawBody: string;
	headers: Headers;
	env: string;
	/** Set on a dedicated shard's webhook; its unregistered accounts go to that shard's worker. */
	shard?: string;
	logger: TwdLogger;
}): Promise<number> => {
	let event: { id?: string; type?: string; account?: string };
	try {
		event = JSON.parse(rawBody);
	} catch (error) {
		logger.warn("ingress: unparseable connect event", {
			error: (error as Error).message,
		});
		return 400;
	}
	const accountId = event?.account;
	if (!accountId) {
		logger.warn("ingress: connect event has no event.account");
		return 400;
	}
	if (isIngressAccountDropped({ accountId })) return 200;
	const workerUrl =
		getIngressRoute({ accountId }) ??
		(shard ? getShardRoute({ shard }) : undefined);
	// Stripe keeps retrying events for released accounts; ack silently.
	if (!workerUrl) return 200;

	const forwardHeaders = new Headers({ "content-type": "application/json" });
	for (const name of FORWARDED_HEADERS) {
		const value = headers.get(name);
		if (value) forwardHeaders.set(name, value);
	}
	const startedAt = Date.now();
	const description = { event: event.id, type: event.type, accountId };
	try {
		const response = await fetch(`${workerUrl}/webhooks/connect/${env}`, {
			method: "POST",
			headers: forwardHeaders,
			body: rawBody,
			redirect: "manual",
		});
		await response.text();
		// Successes are thousands per run and trip Railway's log rate limit; only failures are logged.
		if (!response.ok)
			logger.warn("ingress: forward failed", {
				...description,
				status: response.status,
				elapsedMs: Date.now() - startedAt,
			});
		return response.status;
	} catch (error) {
		logger.error("ingress: forward failed", {
			...description,
			elapsedMs: Date.now() - startedAt,
			error: (error as Error).message,
		});
		return 502;
	}
};
