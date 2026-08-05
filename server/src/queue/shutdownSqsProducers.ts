import { globalEventBatchingManager } from "@/internal/balances/events/EventBatchingManager.js";
import { globalRefreshEntityAggregateBatchingManager } from "@/internal/balances/utils/refreshEntityAggregate/RefreshEntityAggregateBatchingManager.js";
import { globalSyncBatchingManagerV3 } from "@/internal/balances/utils/sync/SyncBatchingManagerV3.js";
import { shutdownSqsSendBatchers } from "./queueUtils.js";

export const shutdownSqsProducers = async (): Promise<void> => {
	try {
		await Promise.all([
			globalEventBatchingManager.flush(),
			globalRefreshEntityAggregateBatchingManager.flush(),
			globalSyncBatchingManagerV3.flush(),
		]);
	} finally {
		await shutdownSqsSendBatchers();
	}
};
