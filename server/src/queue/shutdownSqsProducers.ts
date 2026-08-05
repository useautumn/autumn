import { globalEventBatchingManager } from "@/internal/balances/events/EventBatchingManager.js";
import { globalRefreshEntityAggregateBatchingManager } from "@/internal/balances/utils/refreshEntityAggregate/RefreshEntityAggregateBatchingManager.js";
import { globalSyncBatchingManagerV3 } from "@/internal/balances/utils/sync/SyncBatchingManagerV3.js";
import { flushSqsSendBatchers, shutdownSqsSendBatchers } from "./queueUtils.js";

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
	flushSqsSendBatchersFn = flushSqsSendBatchers,
}: {
	producers?: DeferredSqsProducer[];
	flushSqsSendBatchersFn?: () => Promise<void>;
} = {}): Promise<void> => {
	const producerResults = await Promise.allSettled(
		producers.map((producer) => producer.flush()),
	);
	const sendBatcherResult = await Promise.allSettled([
		flushSqsSendBatchersFn(),
	]);
	const failure = [...producerResults, ...sendBatcherResult].find(
		(result) => result.status === "rejected",
	);
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
