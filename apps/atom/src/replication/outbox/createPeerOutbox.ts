import type { AutumnLogger } from "@autumn/logging";
import type { ThreadCounters } from "../../threads/stats/threadStats.js";
import type { PeerResolver } from "../discovery/createPeerResolver.js";
import type { PeerSender } from "../transport/sendToPeer.js";
import type { ReplicatedOperation } from "../types/replicatedOperation.js";

const DELIVERIES_PER_PEER = 4;
export const HOLD_MS = 5 * 60_000;
const MAX_WAITING_BYTES = 64 * 1024 * 1024;
const RETRY_DELAY_MS = 1_000;
const STOP_FLUSH_MS = 5_000;

export type PeerOutbox = {
	enqueue(params: {
		operation: ReplicatedOperation;
		path: string;
	}): Promise<void>;
	stop(): Promise<void>;
};

type OutboxContext = {
	resolver: PeerResolver;
	send: PeerSender;
	counters: Pick<ThreadCounters, "add">;
	logger: Pick<AutumnLogger, "warn">;
	sleep?: (ms: number) => Promise<unknown>;
	now?: () => number;
};

type Waiting = { operation: ReplicatedOperation; path: string; since: number };

export const createPeerOutbox = ({
	ctx,
}: {
	ctx: OutboxContext;
}): PeerOutbox => {
	const sleep = ctx.sleep ?? Bun.sleep;
	const now = ctx.now ?? Date.now;
	const queues = new Map<string, Map<string, Waiting>>();
	const workers = new Map<string, number>();
	let waitingBytes = 0;
	let inFlight = 0;
	let resolving = 0;
	let stopped = false;
	let flushed = false;
	let onIdle: (() => void) | null = null;

	function queueFor(peer: string): Map<string, Waiting> {
		let queue = queues.get(peer);
		if (!queue) {
			queue = new Map();
			queues.set(peer, queue);
		}
		return queue;
	}

	const waiting = (): number =>
		[...queues.values()].reduce((count, queue) => count + queue.size, 0);

	function settleIfIdle(): void {
		if (resolving === 0 && waiting() === 0 && inFlight === 0) onIdle?.();
	}

	function take({
		queue,
		key,
	}: {
		queue: Map<string, Waiting>;
		key: string;
	}): Waiting | undefined {
		const entry = queue.get(key);
		if (!entry) return undefined;
		queue.delete(key);
		waitingBytes -= entry.operation.body.length;
		return entry;
	}

	function put({
		queue,
		key,
		entry,
	}: {
		queue: Map<string, Waiting>;
		key: string;
		entry: Waiting;
	}): void {
		queue.set(key, entry);
		waitingBytes += entry.operation.body.length;
	}

	function drop({ peer, reason }: { peer: string; reason: string }): void {
		ctx.counters.add("relayDropped");
		ctx.logger.warn(
			{ type: "atom_replication_dropped", data: { peer, reason } },
			"An operation waiting for a peer was dropped",
		);
	}

	function dropOldest(): void {
		for (const [peer, queue] of queues) {
			const oldest = queue.keys().next();
			if (oldest.done) continue;
			take({ queue, key: oldest.value });
			drop({ peer, reason: "too_many_waiting" });
			return;
		}
	}

	function discardQueue(peer: string): void {
		const queue = queues.get(peer);
		if (!queue) return;
		for (const key of [...queue.keys()]) take({ queue, key });
		queues.delete(peer);
	}

	async function deliverUntilEmpty(peer: string): Promise<void> {
		for (;;) {
			const queue = queues.get(peer);
			const next = queue?.keys().next();
			if (!queue || !next || next.done) break;
			const key = next.value;
			const entry = take({ queue, key });
			if (!entry) continue;
			inFlight += 1;
			const delivery = await ctx.send({
				peer,
				path: entry.path,
				operation: entry.operation,
			});
			inFlight -= 1;
			if (delivery === "delivered") {
				ctx.counters.add("relayed");
				continue;
			}
			if (delivery === "rejected") {
				drop({ peer, reason: "rejected" });
				continue;
			}
			ctx.counters.add("relayFailed");
			ctx.resolver.forget();
			if (stopped || now() - entry.since > HOLD_MS) {
				drop({ peer, reason: stopped ? "stopping" : "peer_unreachable" });
				continue;
			}
			const current = queues.get(peer);
			if (current && !current.has(key)) put({ queue: current, key, entry });
			await sleep(RETRY_DELAY_MS);
			if (!(await ctx.resolver.peers()).includes(peer)) {
				discardQueue(peer);
				break;
			}
		}
		workers.set(peer, (workers.get(peer) ?? 1) - 1);
		settleIfIdle();
	}

	function queueOn({
		peer,
		operation,
		path,
	}: {
		peer: string;
		operation: ReplicatedOperation;
		path: string;
	}): void {
		const queue = queueFor(peer);
		const held = take({ queue, key: operation.key });
		put({
			queue,
			key: operation.key,
			entry: { operation, path, since: held?.since ?? now() },
		});
		while (waitingBytes > MAX_WAITING_BYTES) dropOldest();
		const running = workers.get(peer) ?? 0;
		if (running >= DELIVERIES_PER_PEER) return;
		workers.set(peer, running + 1);
		void deliverUntilEmpty(peer);
	}

	async function enqueue({
		operation,
		path,
	}: {
		operation: ReplicatedOperation;
		path: string;
	}): Promise<void> {
		if (stopped) return;
		resolving += 1;
		try {
			const peers = await ctx.resolver.peers();
			if (flushed) return;
			for (const peer of peers) queueOn({ peer, operation, path });
		} finally {
			resolving -= 1;
			settleIfIdle();
		}
	}

	async function stop(): Promise<void> {
		stopped = true;
		if (resolving > 0 || waiting() > 0 || inFlight > 0)
			await Promise.race([
				new Promise<void>((resolve) => {
					onIdle = resolve;
				}),
				sleep(STOP_FLUSH_MS),
			]);
		onIdle = null;
		flushed = true;
		for (const [peer, queue] of queues)
			for (let i = 0; i < queue.size; i++) drop({ peer, reason: "stopping" });
		queues.clear();
		waitingBytes = 0;
	}

	return { enqueue, stop };
};
