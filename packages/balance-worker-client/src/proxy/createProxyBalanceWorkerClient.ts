import { createHttpClient } from "../http/createHttpClient.js";
import type { HttpClient } from "../http/types/httpClient.js";
import type { BalanceWorkerClient } from "../types/balanceWorkerClient.js";
import { sendThroughProxy } from "./sendThroughProxy.js";
import type {
	BalanceWorkerProxyCallParams,
	BalanceWorkerProxyMethod,
	ProxyBalanceWorkerClientConfig,
	ProxySenderContext,
} from "./types/balanceWorkerProxy.js";

const PROXY_TIMEOUT_MS = 15_000;
const PROXY_MAX_RESPONSE_BYTES = 2 * 1_048_576;

export function createProxyBalanceWorkerClient({
	ctx,
	config,
}: {
	ctx: { http?: HttpClient };
	config: ProxyBalanceWorkerClientConfig;
}): BalanceWorkerClient {
	const sender: ProxySenderContext = {
		...config,
		http:
			ctx.http ??
			createHttpClient({
				config: { maxResponseBytes: PROXY_MAX_RESPONSE_BYTES },
			}),
		timeoutMs: PROXY_TIMEOUT_MS,
	};

	function proxied<M extends BalanceWorkerProxyMethod>(method: M) {
		function send({ signal, ...params }: BalanceWorkerProxyCallParams<M>) {
			return sendThroughProxy({ ctx: sender, method, params, signal });
		}
		return send;
	}

	async function start(): Promise<void> {}
	async function stop(): Promise<void> {}

	const enqueue = proxied("enqueue");

	return {
		track: proxied("track"),
		check: proxied("check"),
		readSubjectState: proxied("readSubjectState"),
		initialize: proxied("initialize"),
		applyBillingPlan: proxied("applyBillingPlan"),
		evict: proxied("evict"),
		flush: proxied("flush"),
		finalize: proxied("finalize"),
		confirmExpiredLock: proxied("confirmExpiredLock"),
		reset: proxied("reset"),
		updateBalance: proxied("updateBalance"),
		deleteBalance: proxied("deleteBalance"),
		recalculateBalance: proxied("recalculateBalance"),
		queue: {
			track: enqueue,
			reset: enqueue,
			updateBalance: enqueue,
			evict: enqueue,
			finalize: enqueue,
		},
		enqueue,
		catalog: { invalidateOrgCatalog: proxied("invalidateOrgCatalog") },
		start,
		stop,
	};
}
