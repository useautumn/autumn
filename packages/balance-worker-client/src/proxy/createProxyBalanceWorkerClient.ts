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

/** Covers the API's slowest call (a billing plan's 5s) plus its route refresh and the hop itself. */
const PROXY_TIMEOUT_MS = 15_000;
/** Room for the direct client's 1 MiB reply inside the proxy's envelope. */
const PROXY_MAX_RESPONSE_BYTES = 2 * 1_048_576;

/** The client for a process outside the VPC: the API runs each call on its own client. */
export function createProxyBalanceWorkerClient({
	ctx,
	config,
}: {
	/** `http` is for tests; a process lets the client build the real one. */
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

	// The API's client holds the Kafka connection, so there is nothing to open or close here.
	async function start(): Promise<void> {}
	async function stop(): Promise<void> {}

	// Every queued command is the same append; the API picks each one's partition.
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
		stallOwner: proxied("stallOwner"),
		catalog: { invalidateOrgCatalog: proxied("invalidateOrgCatalog") },
		start,
		stop,
	};
}
