import { globalEventBatchingManager } from "@/internal/balances/events/EventBatchingManager.js";
import { globalRefreshEntityAggregateBatchingManager } from "@/internal/balances/utils/refreshEntityAggregate/RefreshEntityAggregateBatchingManager.js";
import { globalSyncBatchingManagerV3 } from "@/internal/balances/utils/sync/SyncBatchingManagerV3.js";

export const flushBalanceBatchingManagers = async () => {
	const flushResults = await Promise.allSettled([
		globalEventBatchingManager.flush(),
		globalSyncBatchingManagerV3.flush(),
		globalRefreshEntityAggregateBatchingManager.flush(),
	]);
	for (const result of flushResults) {
		if (result.status === "rejected") {
			console.warn("[Shutdown] app-level batch flush failed:", result.reason);
		}
	}
};
