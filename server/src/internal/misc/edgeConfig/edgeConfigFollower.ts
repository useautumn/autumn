import cluster from "node:cluster";
import { ms } from "@autumn/shared";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import {
	EDGE_CONFIG_ERROR,
	EDGE_CONFIG_SUBSCRIBE,
	EDGE_CONFIG_UPDATE,
	type EdgeConfigResultMessage,
	type EdgeConfigSubscribeMessage,
} from "./edgeConfigRelayMessages.js";

export type FollowedStore = {
	applyRaw: (params: { raw: string | null; logger?: Logger }) => void;
	markFailed: (params: { error: unknown; logger?: Logger }) => void;
};

export type FollowEntry = {
	key: string;
	pollIntervalMs?: number;
	store: FollowedStore;
};

type ForkProcess = {
	send?: (message: unknown) => unknown;
	on: (event: "message", listener: (message: unknown) => void) => unknown;
};

const isResultMessage = (
	message: unknown,
): message is EdgeConfigResultMessage => {
	const type = (message as { type?: unknown } | null)?.type;
	return type === EDGE_CONFIG_UPDATE || type === EDGE_CONFIG_ERROR;
};

/** Fork side of the cluster relay: subscribes to keys and applies the raw
 *  bodies the primary broadcasts, instead of polling S3 from every fork. */
export const createEdgeConfigFollower = ({
	processModule = process,
	responseTimeoutMs = ms.seconds(10),
}: {
	processModule?: ForkProcess;
	responseTimeoutMs?: number;
} = {}) => {
	const followersByKey = new Map<
		string,
		{ store: FollowedStore; logger?: Logger }[]
	>();
	const firstAnswerWaiters = new Map<string, (() => void)[]>();
	let listening = false;

	const applyResult = (message: unknown) => {
		if (!isResultMessage(message)) return;
		for (const { store, logger } of followersByKey.get(message.key) ?? []) {
			if (message.type === EDGE_CONFIG_UPDATE) {
				store.applyRaw({ raw: message.raw, logger });
			} else {
				store.markFailed({ error: new Error(message.error), logger });
			}
		}
		for (const resolve of firstAnswerWaiters.get(message.key) ?? []) resolve();
		firstAnswerWaiters.delete(message.key);
	};

	const waitForFirstAnswer = (key: string) =>
		new Promise<void>((resolve) => {
			firstAnswerWaiters.set(key, [
				...(firstAnswerWaiters.get(key) ?? []),
				resolve,
			]);
		});

	const sendSubscribe = (message: EdgeConfigSubscribeMessage) => {
		try {
			processModule.send?.(message);
		} catch {
			// Closed IPC channel: the response timeout falls back to local polling.
		}
	};

	/** Resolves once every key got a first update or error, or at the timeout;
	 *  the caller falls back to local polling for `timedOutKeys`. */
	const follow = async ({
		entries,
		logger,
	}: {
		entries: FollowEntry[];
		logger?: Logger;
	}): Promise<{ timedOutKeys: string[] }> => {
		if (entries.length === 0) return { timedOutKeys: [] };
		if (!listening) {
			processModule.on("message", applyResult);
			listening = true;
		}

		const answeredKeys = new Set<string>();
		const answers = entries.map(({ key, store }) => {
			followersByKey.set(key, [
				...(followersByKey.get(key) ?? []),
				{ store, logger },
			]);
			return waitForFirstAnswer(key).then(() => answeredKeys.add(key));
		});

		sendSubscribe({
			type: EDGE_CONFIG_SUBSCRIBE,
			keys: entries.map(({ key, pollIntervalMs }) =>
				pollIntervalMs === undefined ? { key } : { key, pollIntervalMs },
			),
		});

		let timer: ReturnType<typeof setTimeout> | undefined;
		await Promise.race([
			Promise.all(answers),
			new Promise((resolve) => {
				timer = setTimeout(resolve, responseTimeoutMs);
			}),
		]);
		clearTimeout(timer);

		const timedOutKeys = entries
			.map(({ key }) => key)
			.filter((key) => !answeredKeys.has(key));
		if (timedOutKeys.length > 0) {
			logger?.warn(
				`[EdgeConfig] cluster primary did not answer within ${responseTimeoutMs}ms for ${timedOutKeys.join(", ")}; falling back to local S3 polling`,
			);
		}
		return { timedOutKeys };
	};

	return { follow };
};

export type EdgeConfigFollower = ReturnType<typeof createEdgeConfigFollower>;

let follower: EdgeConfigFollower | null | undefined;

/** Null unless this process is a cluster fork whose primary runs the relay;
 *  the test override keeps every process on its in-memory config. */
export const getEdgeConfigFollower = (): EdgeConfigFollower | null => {
	if (follower !== undefined) return follower;
	const primaryRunsRelay = process.env.AUTUMN_EDGE_CONFIG_RELAY === "1";
	const usesOverride = Boolean(process.env.AUTUMN_EDGE_CONFIG_OVERRIDE_B64);
	follower =
		cluster.isWorker && primaryRunsRelay && !usesOverride
			? createEdgeConfigFollower()
			: null;
	return follower;
};
