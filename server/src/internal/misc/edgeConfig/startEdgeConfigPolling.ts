import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { EdgeConfigStore } from "./edgeConfigStore.js";

type PollableEdgeConfig = Pick<EdgeConfigStore<unknown>, "startPolling">;

export const startEdgeConfigPolling = async ({
	stores,
	logger,
}: {
	stores: readonly PollableEdgeConfig[];
	logger: Logger;
}): Promise<void> => {
	await Promise.all(stores.map((store) => store.startPolling({ logger })));
};
