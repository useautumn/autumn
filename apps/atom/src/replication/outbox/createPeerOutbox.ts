import type { AutumnLogger } from "@autumn/logging";
import type { ThreadCounters } from "../../threads/stats/threadStats.js";
import type { PeerResolver } from "../discovery/createPeerResolver.js";
import type { PeerSender } from "../transport/sendToPeer.js";
import type { ReplicatedOperation } from "../types/replicatedOperation.js";

/** Deliveries in flight per peer; the rest wait, newest copy per key, so a slow peer never holds up a receive. */
const DELIVERIES_PER_PEER = 4;
/** A peer that is restarting is back within this; after it a waiting copy is dropped, and the peer's catch-up covers it. */
const HOLD_MS = 5 * 60_000;
/** Copies waiting across all peers; past this the oldest is dropped, counted, so memory stays bounded under a long outage. */
const MAX_WAITING = 20_000;
const RETRY_DELAY_MS = 1_000;
/** On stop: how long the copies still waiting get to reach their peers before they are dropped. */
const STOP_FLUSH_MS = 5_000;

export type PeerOutbox = {
	/** Queues the operation for every peer known now. */
	enqueue(params: {
		operation: ReplicatedOperation;
		path: string;
	}): Promise<void>;
	/** Takes nothing more; resolves once what was waiting is delivered or the flush window passes, dropping the rest. */
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

/** Per thread: what this thread applied, on its way to each other replica, one queue per peer in arrival order. */
export const createPeerOutbox = ({
	ctx,
}: {
	ctx: OutboxContext;
}): PeerOutbox => {
	const sleep = ctx.sleep ?? Bun.sleep;
	const now = ctx.now ?? Date.now;
	const queues = new Map<string, Map<string, Waiting>>();
	const workers = new Map<string, number>();
	let waiting = 0;
	let inFlight = 0;
	let stopped = false;
	let onIdle: (() => void) | null = null;

	function queueFor(peer: string): Map<string, Waiting> {
		let queue = queues.get(peer);
		if (!queue) {
			queue = new Map();
			queues.set(peer, queue);
		}
		return queue;
	}

	function settleIfIdle(): void {
		if (waiting === 0 && inFlight === 0) onIdle?.();
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
			queue.delete(oldest.value);
			waiting -= 1;
			drop({ peer, reason: "too_many_waiting" });
			return;
		}
	}

	function discardQueue(peer: string): void {
		const queue = queues.get(peer);
		if (!queue) return;
		waiting -= queue.size;
		queues.delete(peer);
	}

	async function deliverUntilEmpty(peer: string): Promise<void> {
		const queue = queueFor(peer);
		for (;;) {
			const next = queue.entries().next();
			if (next.done) break;
			const [key, entry] = next.value;
			queue.delete(key);
			waiting -= 1;
			inFlight += 1;
			const delivered = await ctx.send({
				peer,
				path: entry.path,
				operation: entry.operation,
			});
			inFlight -= 1;
			if (delivered) {
				ctx.counters.add("relayed");
				continue;
			}
			ctx.counters.add("relayFailed");
			ctx.resolver.forget();
			if (stopped || now() - entry.since > HOLD_MS) {
				drop({ peer, reason: stopped ? "stopping" : "peer_unreachable" });
				continue;
			}
			// Back at the front with its original age; a newer copy that arrived meanwhile wins over it.
			if (!queue.has(key)) {
				queue.set(key, entry);
				waiting += 1;
			}
			await sleep(RETRY_DELAY_MS);
			// A peer that left the service name was replaced; its new address gets the rest through catch-up.
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
		const held = queue.get(operation.key);
		if (held) queue.delete(operation.key);
		else waiting += 1;
		queue.set(operation.key, { operation, path, since: held?.since ?? now() });
		while (waiting > MAX_WAITING) dropOldest();
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
		for (const peer of await ctx.resolver.peers())
			queueOn({ peer, operation, path });
	}

	/** What is still waiting gets one flush window; a peer that is down by then loses those copies to its own catch-up. */
	async function stop(): Promise<void> {
		stopped = true;
		if (waiting === 0 && inFlight === 0) return;
		await Promise.race([
			new Promise<void>((resolve) => {
				onIdle = resolve;
			}),
			sleep(STOP_FLUSH_MS),
		]);
		onIdle = null;
		for (const [peer, queue] of queues)
			for (let i = 0; i < queue.size; i++) drop({ peer, reason: "stopping" });
		queues.clear();
		waiting = 0;
	}

	return { enqueue, stop };
};
