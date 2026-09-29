import type {
	BalanceWorkerClient,
	BalanceWorkerProxyCall,
} from "@autumn/balance-worker-client";

export function runProxyCall({
	client,
	call,
}: {
	client: BalanceWorkerClient;
	call: BalanceWorkerProxyCall;
}): Promise<unknown> {
	switch (call.method) {
		case "track":
			return client.track(call.params);
		case "check":
			return client.check(call.params);
		case "readSubjectState":
			return client.readSubjectState(call.params);
		case "initialize":
			return client.initialize(call.params);
		case "applyBillingPlan":
			return client.applyBillingPlan(call.params);
		case "evict":
			return client.evict(call.params);
		case "flush":
			return client.flush(call.params);
		case "finalize":
			return client.finalize(call.params);
		case "confirmExpiredLock":
			return client.confirmExpiredLock(call.params);
		case "reset":
			return client.reset(call.params);
		case "updateBalance":
			return client.updateBalance(call.params);
		case "deleteBalance":
			return client.deleteBalance(call.params);
		case "recalculateBalance":
			return client.recalculateBalance(call.params);
		case "enqueue":
			return client.enqueue(call.params);
		case "invalidateOrgCatalog":
			return client.catalog.invalidateOrgCatalog(call.params);
	}
}
