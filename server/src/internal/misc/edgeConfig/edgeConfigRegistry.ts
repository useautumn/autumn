import type { Logger } from "@/external/logtail/logtailUtils.js";

type EdgeConfigLifecycle = {
	startPolling: (options?: { logger?: Logger }) => Promise<void>;
	stopPolling: () => void;
};

const stores: EdgeConfigLifecycle[] = [];

export const registerEdgeConfig = ({
	store,
}: {
	store: EdgeConfigLifecycle;
}) => {
	stores.push(store);
};

export const startAllEdgeConfigPolling = async ({
	logger,
}: {
	logger?: Logger;
} = {}) => {
	await Promise.all(stores.map((store) => store.startPolling({ logger })));
};

export const stopAllEdgeConfigPolling = () => {
	for (const store of stores) store.stopPolling();
};
