import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { EdgeConfigStore } from "./edgeConfigStore.js";

type PollableEdgeConfig = Pick<EdgeConfigStore<unknown>, "startPolling">;

/**
 * Polls only the named stores, for a runtime that needs a few configs rather than the whole registry
 * (trigger has no boot hook and should not pay for every admin config). Each store starts once per process.
 */
export const startEdgeConfigPolling = async ({
	stores,
	logger,
}: {
	stores: readonly PollableEdgeConfig[];
	logger: Logger;
}): Promise<void> => {
	await Promise.all(stores.map((store) => store.startPolling({ logger })));
};
