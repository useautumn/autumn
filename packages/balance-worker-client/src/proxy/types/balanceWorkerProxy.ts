import type { WorkerErrorCode } from "../../contracts/worker.js";
import type { HttpClient } from "../../http/types/httpClient.js";
import type { BalanceWorkerClient } from "../../types/balanceWorkerClient.js";
import type {
	BalanceWorkerClientErrorCode,
	WorkerRequestOutcome,
} from "../../types/balanceWorkerClientErrors.js";

/** The client's calls as the proxy names them; the catalog's one call is flattened. */
type ProxiedCalls = Omit<
	BalanceWorkerClient,
	"queue" | "catalog" | "start" | "stop" | "readCheckLeaseCounters"
> & {
	invalidateOrgCatalog: BalanceWorkerClient["catalog"]["invalidateOrgCatalog"];
};

export type BalanceWorkerProxyMethod = keyof ProxiedCalls;
export type BalanceWorkerProxyCallParams<M extends BalanceWorkerProxyMethod> =
	Parameters<ProxiedCalls[M]>[0];
/** What crosses the wire: a call's params without its abort signal. */
export type BalanceWorkerProxyParams<M extends BalanceWorkerProxyMethod> = Omit<
	BalanceWorkerProxyCallParams<M>,
	"signal"
>;
export type BalanceWorkerProxyReply<M extends BalanceWorkerProxyMethod> =
	Awaited<ReturnType<ProxiedCalls[M]>>;

export type BalanceWorkerProxyCall = {
	[M in BalanceWorkerProxyMethod]: {
		method: M;
		params: BalanceWorkerProxyParams<M>;
	};
}[BalanceWorkerProxyMethod];

/** The signed body: the call, who sent it, and when, so a captured request expires. */
export type BalanceWorkerProxyRequest = BalanceWorkerProxyCall & {
	caller: string;
	sentAt: number;
};

/** A `BalanceWorkerClientError` as JSON, so the caller rethrows the error the API's client threw. */
export type BalanceWorkerProxyError = {
	code: BalanceWorkerClientErrorCode;
	outcome: WorkerRequestOutcome;
	message: string;
	workerCode?: WorkerErrorCode;
	workerReason?: string;
};

export type BalanceWorkerProxyResponse = {
	status: 200 | 400 | 401;
	body: { reply: unknown } | { error: BalanceWorkerProxyError };
};

export type ProxyBalanceWorkerClientConfig = {
	/** The API's origin, e.g. `https://api.useautumn.com`. */
	url: string;
	secret: string;
	/** Who is calling, e.g. the host's name; the API logs it with each call. */
	caller: string;
};

export type ProxySenderContext = {
	http: HttpClient;
	url: string;
	secret: string;
	caller: string;
	timeoutMs: number;
};
