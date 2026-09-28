import type { LiveEvent, LiveServerMessage } from "../../../api/contract.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import type { LiveConnection } from "../types/liveConnection.ts";
import { loadTopicSnapshot } from "./loadTopicSnapshot.ts";

/** A client this far behind gets dropped; it reconnects and resnapshots. */
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;

const connections = new Map<string, LiveConnection>();
const subscribers = new Map<string, Set<LiveConnection>>();

const deliver = ({
	connection,
	topic,
	event,
}: {
	connection: LiveConnection;
	topic: string;
	event: LiveEvent;
}) => {
	if (connection.bufferedAmount() > MAX_BUFFERED_BYTES) {
		connection.close({ code: 1013, reason: "slow consumer; reconnect" });
		return;
	}
	const message: LiveServerMessage = {
		type: "event",
		topic,
		seq: ++connection.seq,
		event,
	};
	const pending = connection.pending.get(topic);
	if (pending) pending.push(message);
	else connection.send(message);
};

export const hasLiveSubscribers = ({ topic }: { topic: string }) =>
	(subscribers.get(topic)?.size ?? 0) > 0;

export const publishLive = ({
	topic,
	event,
}: {
	topic: string;
	event: LiveEvent;
}) => {
	for (const connection of subscribers.get(topic) ?? [])
		deliver({ connection, topic, event });
};

export const addLiveConnection = ({
	connection,
}: {
	connection: LiveConnection;
}) => {
	connections.set(connection.id, connection);
};

export const removeLiveConnection = ({
	connectionId,
}: {
	connectionId: string;
}) => {
	const connection = connections.get(connectionId);
	if (!connection) return;
	for (const topic of connection.topics)
		subscribers.get(topic)?.delete(connection);
	connections.delete(connectionId);
};

/** Subscribes, then sends the snapshot followed by any events raised while it loaded. */
export const subscribeLive = async ({
	ctx,
	connection,
	topic,
}: {
	ctx: TwdContext;
	connection: LiveConnection;
	topic: string;
}) => {
	if (connection.topics.has(topic)) return;
	connection.topics.add(topic);
	connection.pending.set(topic, []);
	let topicSubscribers = subscribers.get(topic);
	if (!topicSubscribers) {
		topicSubscribers = new Set();
		subscribers.set(topic, topicSubscribers);
	}
	topicSubscribers.add(connection);
	try {
		connection.send({
			type: "snapshot",
			topic,
			data: await loadTopicSnapshot({ ctx, topic }),
		});
	} catch (error) {
		connection.send({
			type: "error",
			error: {
				code: "snapshot_failed",
				message: `Could not load ${topic}: ${error instanceof Error ? error.message : String(error)}`,
				next: "Unsubscribe and subscribe again; fetch the REST route if it keeps failing.",
				escalate: null,
			},
		});
	} finally {
		for (const message of connection.pending.get(topic) ?? [])
			connection.send(message);
		connection.pending.delete(topic);
	}
};

export const unsubscribeLive = ({
	connection,
	topic,
}: {
	connection: LiveConnection;
	topic: string;
}) => {
	connection.topics.delete(topic);
	connection.pending.delete(topic);
	subscribers.get(topic)?.delete(connection);
};

export const liveConnectionCount = () => connections.size;
