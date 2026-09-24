import { EventEmitter } from "node:events";

export type SentMessage = {
	type: string;
	key?: string;
	raw?: string | null;
	error?: string;
	keys?: { key: string; pollIntervalMs?: number }[];
};

export type FakeClusterWorker = {
	id: number;
	sent: SentMessage[];
	dead: boolean;
	send: (message: unknown) => boolean;
	isDead: () => boolean;
};

/** node:cluster primary double: forks record what the primary sends them. */
export const createFakeCluster = () => {
	const emitter = new EventEmitter();
	const workers: Record<string, FakeClusterWorker> = {};
	let nextId = 1;

	const fork = () => {
		const worker: FakeClusterWorker = {
			id: nextId++,
			sent: [],
			dead: false,
			send: (message) => {
				worker.sent.push(message as SentMessage);
				return true;
			},
			isDead: () => worker.dead,
		};
		workers[String(worker.id)] = worker;
		return worker;
	};

	const subscribe = ({
		worker,
		keys,
	}: {
		worker: FakeClusterWorker;
		keys: { key: string; pollIntervalMs?: number }[];
	}) =>
		emitter.emit("message", worker, { type: "edge-config:subscribe", keys });

	const clusterModule = {
		workers,
		on: (
			event: "message",
			listener: (worker: FakeClusterWorker, message: unknown) => void,
		) => emitter.on(event, listener),
	};

	return { clusterModule, emitter, fork, subscribe };
};

/** Updates a fork received for one key, in arrival order. */
export const sentFor = ({
	worker,
	key,
}: {
	worker: FakeClusterWorker;
	key: string;
}) => worker.sent.filter((message) => message.key === key);

/** Fake process for a fork: captures sends to the primary, lets tests reply. */
export const createFakeForkProcess = () => {
	const emitter = new EventEmitter();
	const sent: SentMessage[] = [];
	return {
		sent,
		processModule: {
			send: (message: unknown) => {
				sent.push(message as SentMessage);
				return true;
			},
			on: (event: "message", listener: (message: unknown) => void) =>
				emitter.on(event, listener),
		},
		reply: (message: SentMessage) => emitter.emit("message", message),
	};
};

export const lastOf = <T>(list: T[]): T | undefined => list[list.length - 1];
