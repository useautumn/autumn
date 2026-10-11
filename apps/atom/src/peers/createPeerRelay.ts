import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import type { AutumnLogger } from "@autumn/logging";
import type { ThreadCounters } from "../threads/stats/threadStats.js";
import {
	PEER_RELAYED_HEADER,
	PEER_SIGNATURE_HEADER,
	signPeerBody,
} from "./peerSignature.js";
import { createPeerResolver } from "./resolvePeers.js";
import type { PeerRelay, RelayedPush } from "./types/peerRelay.js";

/** Deliveries in flight per peer; the rest wait, newest copy per subject, so a slow peer never holds up a receive. */
const DELIVERIES_PER_PEER = 4;
/** A peer that is restarting comes back within this; after it, a pending copy is dropped and its next push corrects it. */
const HOLD_MS = 5 * 60_000;
/** Pending copies across all peers; past this the oldest is dropped, counted, so memory stays bounded under a long outage. */
const MAX_PENDING = 20_000;
const DELIVERY_TIMEOUT_MS = 2_000;
const RETRY_DELAY_MS = 1_000;

type PeerRelayContext = {
	tokenHash: string;
	port: number;
	counters: Pick<ThreadCounters, "add">;
	logger: Pick<AutumnLogger, "warn">;
	sleep?: (ms: number) => Promise<unknown>;
	now?: () => number;
};

type Pending = { push: RelayedPush; since: number };

const pushKey = (push: RelayedPush): string =>
	push.kind === "subjects.set" ? `s:${push.customerId}` : "catalog";

/**
 * Per thread: the pushes this thread applied, passed on to each other replica. Newest copy per subject wins, as on
 * the receiving side, so a relay lost to a restart is replaced by the next and never applied out of order.
 */
export const createPeerRelay = ({
	ctx,
}: {
	ctx: PeerRelayContext;
}): PeerRelay => {
	const sleep = ctx.sleep ?? Bun.sleep;
	const now = ctx.now ?? Date.now;
	const resolver = createPeerResolver({ now });
	const pending = new Map<string, Map<string, Pending>>();
	const workers = new Map<string, number>();
	let pendingCount = 0;
	let stopped = false;

	function queueFor(peer: string): Map<string, Pending> {
		let queue = pending.get(peer);
		if (!queue) {
			queue = new Map();
			pending.set(peer, queue);
		}
		return queue;
	}

	function dropOldest(): void {
		for (const [peer, queue] of pending) {
			const first = queue.keys().next();
			if (first.done) continue;
			queue.delete(first.value);
			pendingCount -= 1;
			ctx.counters.add("relayDropped");
			ctx.logger.warn(
				{ type: "atom_relay_dropped", data: { peer, reason: "pending_full" } },
				"A pending relay was dropped: too many wait for a peer",
			);
			return;
		}
	}

	async function deliver({
		peer,
		push,
	}: {
		peer: string;
		push: RelayedPush;
	}): Promise<boolean> {
		const path =
			push.kind === "subjects.set" ? "/v1/subjects.set" : "/v1/catalog.set";
		const headers: Record<string, string> = {
			"content-type": "application/json",
			[PEER_SIGNATURE_HEADER]: signPeerBody({
				tokenHash: ctx.tokenHash,
				body: push.body,
			}),
			[PEER_RELAYED_HEADER]: "1",
		};
		if (push.kind === "subjects.set")
			headers[ATOM_CUSTOMER_ID_HEADER] = push.customerId;
		try {
			const res = await fetch(`http://${peer}:${ctx.port}${path}`, {
				method: "POST",
				headers,
				body: push.body,
				signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
			});
			await res.text();
			// A 4xx is this replica's own mistake or an older copy; delivering it again would not change the answer.
			return res.ok || (res.status >= 400 && res.status < 500);
		} catch {
			return false;
		}
	}

	async function work(peer: string): Promise<void> {
		const queue = queueFor(peer);
		while (!stopped) {
			const next = queue.entries().next();
			if (next.done) break;
			const [key, entry] = next.value;
			queue.delete(key);
			pendingCount -= 1;
			if (await deliver({ peer, push: entry.push })) {
				ctx.counters.add("relayed");
				continue;
			}
			ctx.counters.add("relayFailed");
			resolver.forget();
			if (now() - entry.since > HOLD_MS) {
				ctx.counters.add("relayDropped");
				ctx.logger.warn(
					{
						type: "atom_relay_dropped",
						data: { peer, reason: "peer_unreachable" },
					},
					"A relay was dropped: the peer stayed unreachable",
				);
				continue;
			}
			// Back at the front with its original age; a newer copy that arrived meanwhile wins over it.
			if (!queue.has(key)) {
				queue.set(key, entry);
				pendingCount += 1;
			}
			await sleep(RETRY_DELAY_MS);
			if (!(await resolver.peers()).includes(peer)) {
				for (const dropped of queue.keys()) queue.delete(dropped);
				pendingCount -= queue.size;
				break;
			}
		}
		workers.set(peer, (workers.get(peer) ?? 1) - 1);
	}

	function enqueue({ peer, push }: { peer: string; push: RelayedPush }): void {
		const queue = queueFor(peer);
		const key = pushKey(push);
		const held = queue.get(key);
		if (held) queue.delete(key);
		else pendingCount += 1;
		queue.set(key, { push, since: held?.since ?? now() });
		while (pendingCount > MAX_PENDING) dropOldest();
		const running = workers.get(peer) ?? 0;
		if (running < DELIVERIES_PER_PEER) {
			workers.set(peer, running + 1);
			void work(peer);
		}
	}

	return {
		relay(push) {
			if (stopped) return;
			void resolver.peers().then((peers) => {
				for (const peer of peers) enqueue({ peer, push });
			});
		},
		peers: () => resolver.peers(),
		stop() {
			stopped = true;
		},
	};
};
