import type { Logger } from "@/external/logtail/logtailUtils.js";
import { createEdgeConfigRegistry } from "./edgeConfigRegistry.js";
import {
	EDGE_CONFIG_ERROR,
	EDGE_CONFIG_SUBSCRIBE,
	EDGE_CONFIG_UPDATE,
	type EdgeConfigResultMessage,
	type EdgeConfigSubscribeMessage,
	type EdgeConfigSubscription,
} from "./edgeConfigRelayMessages.js";
import { readEdgeConfigRaw } from "./readEdgeConfigRaw.js";

type RelayWorker = {
	send: (message: EdgeConfigResultMessage) => unknown;
	isDead: () => boolean;
};

type RelayCluster = {
	workers?: NodeJS.Dict<RelayWorker>;
	on: (
		event: "message",
		listener: (worker: RelayWorker, message: unknown) => void,
	) => unknown;
};

const isSubscribeMessage = (
	message: unknown,
): message is EdgeConfigSubscribeMessage =>
	(message as { type?: unknown } | null)?.type === EDGE_CONFIG_SUBSCRIBE &&
	Array.isArray((message as { keys?: unknown }).keys);

// A fork whose IPC channel just closed makes `send` raise; its exit is handled
// elsewhere, so the failed write must not take the primary down.
const sendSafely = ({
	worker,
	message,
}: {
	worker: RelayWorker;
	message: EdgeConfigResultMessage;
}) => {
	try {
		if (!worker.isDead()) worker.send(message);
	} catch {}
};

/**
 * Cluster primary as a pure relay: one S3 fetch per key per change for the whole
 * task, fanned out to every fork as the raw body. Forks parse with their own
 * schemas, so the primary needs none of the stores registered. Call before
 * forking: the env flag is what makes forks (and their respawns) follow.
 */
export const startEdgeConfigRelay = async ({
	clusterModule,
	logger,
	fetchRaw = readEdgeConfigRaw,
	registry = createEdgeConfigRegistry({ follower: null }),
}: {
	clusterModule: RelayCluster;
	logger: Logger;
	fetchRaw?: (params: { key: string }) => Promise<string | null>;
	registry?: ReturnType<typeof createEdgeConfigRegistry>;
}) => {
	process.env.AUTUMN_EDGE_CONFIG_RELAY = "1";

	const lastResults = new Map<string, EdgeConfigResultMessage>();
	const inFlight = new Map<string, Promise<void>>();
	const subscribedKeys = new Set<string>();
	const intervalTimers: ReturnType<typeof setInterval>[] = [];

	const broadcast = (message: EdgeConfigResultMessage) => {
		for (const worker of Object.values(clusterModule.workers ?? {})) {
			if (worker) sendSafely({ worker, message });
		}
	};

	const fetchAndBroadcast = async ({ key }: { key: string }) => {
		let message: EdgeConfigResultMessage;
		try {
			message = { type: EDGE_CONFIG_UPDATE, key, raw: await fetchRaw({ key }) };
		} catch (error) {
			const text = error instanceof Error ? error.message : String(error);
			message = { type: EDGE_CONFIG_ERROR, key, error: text };
		}
		lastResults.set(key, message);
		broadcast(message);
	};

	// Single-flight: concurrent subscribes and signal refreshes share one GET.
	const refreshKey = ({ key }: { key: string }) => {
		const pending = inFlight.get(key);
		if (pending) return pending;
		const request = fetchAndBroadcast({ key }).finally(() => {
			inFlight.delete(key);
		});
		inFlight.set(key, request);
		return request;
	};

	const trackKey = ({ key, pollIntervalMs }: EdgeConfigSubscription) => {
		subscribedKeys.add(key);
		if (pollIntervalMs !== undefined) {
			intervalTimers.push(
				setInterval(() => void refreshKey({ key }), pollIntervalMs),
			);
			return;
		}
		registry.register({
			store: {
				s3Key: key,
				refresh: () => refreshKey({ key }),
				getStatus: () => ({
					healthy: lastResults.get(key)?.type === EDGE_CONFIG_UPDATE,
				}),
				// Never called: the relay's own registry runs with follower: null.
				applyRaw: () => {},
				markFailed: () => {},
			},
		});
	};

	const handleSubscribe = ({
		worker,
		keys,
	}: {
		worker: RelayWorker;
		keys: EdgeConfigSubscription[];
	}) => {
		for (const subscription of keys) {
			if (!subscribedKeys.has(subscription.key)) trackKey(subscription);
			const cached = lastResults.get(subscription.key);
			if (cached) sendSafely({ worker, message: cached });
			else void refreshKey({ key: subscription.key });
		}
	};

	clusterModule.on("message", (worker, message) => {
		if (!isSubscribeMessage(message)) return;
		handleSubscribe({ worker, keys: message.keys });
	});

	await registry.start({ logger });
	logger.info("[EdgeConfig] cluster relay started; forks follow the primary");

	return {
		stop: () => {
			registry.stop();
			for (const timer of intervalTimers) clearInterval(timer);
		},
	};
};
