import { globalEventBatchingManager } from "@/internal/balances/events/EventBatchingManager.js";
import { globalRefreshEntityAggregateBatchingManager } from "@/internal/balances/utils/refreshEntityAggregate/RefreshEntityAggregateBatchingManager.js";
import { globalSyncBatchingManagerV3 } from "@/internal/balances/utils/sync/SyncBatchingManagerV3.js";
import { shutdownSqsSendBatchers } from "./queueUtils.js";

type DeferredSqsProducer = {
	flush: () => Promise<void>;
};

const defaultProducers: DeferredSqsProducer[] = [
	globalEventBatchingManager,
	globalRefreshEntityAggregateBatchingManager,
	globalSyncBatchingManagerV3,
];

export const flushSqsProducers = async ({
	producers = defaultProducers,
}: {
	producers?: DeferredSqsProducer[];
} = {}): Promise<void> => {
	const results = await Promise.allSettled(
		producers.map((producer) => producer.flush()),
	);
	const failure = results.find((result) => result.status === "rejected");
	if (failure) throw failure.reason;
};

export const shutdownSqsProducers = async ({
	producers = defaultProducers,
	shutdownSqsSendBatchersFn = shutdownSqsSendBatchers,
}: {
	producers?: DeferredSqsProducer[];
	shutdownSqsSendBatchersFn?: () => Promise<void>;
} = {}): Promise<void> => {
	try {
		await flushSqsProducers({ producers });
	} finally {
		await shutdownSqsSendBatchersFn();
	}
};
