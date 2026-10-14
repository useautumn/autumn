import type { WorkerErrorCode } from "../../contracts/worker.js";
import type { HttpClient } from "../../http/types/httpClient.js";
import type { BalanceWorkerClient } from "../../types/balanceWorkerClient.js";
import type {
	BalanceWorkerClientErrorCode,
	WorkerRequestOutcome,
} from "../../types/balanceWorkerClientErrors.js";

type ProxiedCalls = Omit<
	BalanceWorkerClient,
	"queue" | "catalog" | "start" | "stop"
> & {
	invalidateOrgCatalog: BalanceWorkerClient["catalog"]["invalidateOrgCatalog"];
};

export type BalanceWorkerProxyMethod = keyof ProxiedCalls;
export type BalanceWorkerProxyCallParams<M extends BalanceWorkerProxyMethod> =
	Parameters<ProxiedCalls[M]>[0];
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

export type BalanceWorkerProxyRequest = BalanceWorkerProxyCall & {
	caller: string;
	sentAt: number;
};

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
	url: string;
	secret: string;
	caller: string;
};

export type ProxySenderContext = {
	http: HttpClient;
	url: string;
	secret: string;
	caller: string;
	timeoutMs: number;
};
