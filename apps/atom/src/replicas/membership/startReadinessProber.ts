import type { AutumnLogger } from "@autumn/logging";
import type { Replication } from "../../replication/types/replication.js";
import {
	type HandOffContext,
	handOffJournals,
	type LockMarks,
} from "../handover/handOffJournals.js";
import type { ReplicaRing } from "../types/replicaRing.js";
import type { Membership } from "./types/membership.js";

/** How often each thread looks at the peers the service name lists that are not members yet. */
export const PROBE_EVERY_MS = 1_000;
const PROBE_TIMEOUT_MS = 1_000;
/** A listed peer that has answered no probe for this long is worth a line: both replicas may be owning everything. */
const UNPROBED_WARN_MS = 60_000;
/** Between a thread's sweeps for what it took for the moving customers while the other threads were still handing off. */
const JOIN_SWEEP_MS = 20;
/** Sweeps before a thread gives up waiting for the others (5 s): a wedged thread never holds the join for good. */
const MAX_JOIN_SWEEPS = 250;

export type ReadinessProberContext = Omit<HandOffContext, "ring"> & {
	ring: ReplicaRing;
	membership: Membership;
	replication: Pick<Replication, "peers">;
	/** This thread, and the replica's threads: a peer is joined once every one of them has handed it its customers' entries. */
	thread: number;
	threads: number;
	/** The peers' public port, where /health says whether they serve, and from which boot. */
	publicPort: number;
	logger: Pick<AutumnLogger, "info" | "warn">;
	sleep?: (ms: number) => Promise<unknown>;
	/** A test seam: told each peer this thread handed its entries to. */
	onHandedOff?: (peer: string) => void;
};

/** The boot a ready peer answers from; null when it is not ready or not reachable. */
const readyBootOf = async ({
	ctx,
	peer,
}: {
	ctx: ReadinessProberContext;
	peer: string;
}): Promise<string | null> => {
	try {
		const reply = await (ctx.peer.fetch ?? fetch)(
			`http://${peer}:${ctx.publicPort}/health`,
			{ signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) },
		);
		const health = (await reply.json().catch(() => null)) as {
			bootedAt?: string;
		} | null;
		if (reply.status !== 200) return null;
		return health?.bootedAt ?? "unknown";
	} catch {
		return null;
	}
};

/**
 * A peer the service name lists is counted as an owner only once it answers ready and every thread has handed it the
 * entries of the customers that move to it; the last thread to do so flips it to joined, for every thread at once. A
 * leaving peer that answers from a new boot is back: counted again the same way. One the service name dropped is
 * forgotten once it answers no more, so a listing that flaps for a moment never unseats a live member.
 */
export const startReadinessProber = ({
	ctx,
}: {
	ctx: ReadinessProberContext;
}) => {
	const sleep = ctx.sleep ?? Bun.sleep;
	/** Every peer this thread has seen listed, so one that disappears is forgotten. */
	const seen = new Set<string>();
	/** When each listed peer was first seen unready, until it answers; warned about once. */
	const unreadySince = new Map<string, number>();
	let stopped = false;

	const noteUnready = (peer: string) => {
		const since = unreadySince.get(peer) ?? Date.now();
		unreadySince.set(peer, since);
		if (Date.now() - since < UNPROBED_WARN_MS) return;
		unreadySince.set(peer, Number.POSITIVE_INFINITY);
		ctx.logger.warn(
			{ type: "atom_peer_unprobed", data: { peer, port: ctx.publicPort } },
			"A listed peer has answered no readiness probe for a minute: it is not counted as an owner, so both replicas may be owning its customers",
		);
	};

	/** Ready from nothing, or back from leaving under a new boot: marked ready, so every thread hands off to it. */
	async function noticeReady(peer: string): Promise<void> {
		const state = ctx.membership.stateOf(peer);
		if (state === "ready" || state === "joined") return;
		const boot = await readyBootOf({ ctx, peer });
		if (boot === null) {
			if (state === null) noteUnready(peer);
			return;
		}
		if (state === "leaving" && ctx.membership.isBootOf({ address: peer, boot }))
			return;
		ctx.membership.markReady({ address: peer, boot });
		unreadySince.delete(peer);
	}

	/**
	 * Until the last thread has handed off, this thread still owns the moving customers and may take locks or append
	 * entries for them: it hands those too, every JOIN_SWEEP_MS, and once more after the peer is counted. In the
	 * background, so a slow thread never holds this one's probing of its other peers.
	 */
	async function sweepUntilJoined({
		ctx,
		peer,
		ownerOf,
		marks,
	}: {
		ctx: ReadinessProberContext;
		peer: string;
		ownerOf: (customerId: string) => Promise<string>;
		marks: LockMarks;
	}): Promise<void> {
		let sweeps = 0;
		let handed = 0;
		let locks = 0;
		const sweep = async () => {
			const swept = await handOffJournals({ ctx, ownerOf, marks, quiet: true });
			sweeps++;
			handed += swept.handed;
			locks += swept.locks;
		};
		while (
			!stopped &&
			!ctx.membership.isMember(peer) &&
			sweeps < MAX_JOIN_SWEEPS
		) {
			await sleep(JOIN_SWEEP_MS);
			await sweep();
		}
		if (stopped) return;
		if (ctx.membership.isMember(peer)) await sweep();
		else
			ctx.logger.warn(
				{ type: "atom_join_sweeps_exhausted", data: { peer, sweeps } },
				`Swept ${sweeps} times without every thread handing off to ${peer}; what this thread takes for its customers from now on drains to Autumn`,
			);
		if (handed > 0 || locks > 0)
			ctx.logger.info(
				{ type: "atom_join_swept", data: { peer, sweeps, handed, locks } },
				`Handed ${peer} ${handed} more entries and ${locks} more locks taken while the other threads were still handing off`,
			);
	}

	/** Dropped by the name and answering from no boot this replica knows: gone, so its row is cleared. */
	async function forgetGone(peer: string): Promise<void> {
		const boot = await readyBootOf({ ctx, peer });
		if (boot !== null && ctx.membership.isBootOf({ address: peer, boot }))
			return;
		seen.delete(peer);
		ctx.membership.forget(peer);
	}

	async function probeOnce(): Promise<void> {
		const listed = (await ctx.replication.peers().catch(() => [])).filter(
			(peer) => peer !== ctx.ring.self,
		);
		for (const peer of seen) if (!listed.includes(peer)) await forgetGone(peer);
		for (const peer of listed) {
			seen.add(peer);
			await noticeReady(peer);
			if (
				ctx.membership.stateOf(peer) !== "ready" ||
				ctx.membership.hasHandedOff({ address: peer, thread: ctx.thread })
			)
				continue;
			const ownerOf = (customerId: string) =>
				ctx.ring.ownerOnceJoined({ customerId, peer });
			const marks: LockMarks = new Map();
			await handOffJournals({ ctx, ownerOf, marks });
			ctx.onHandedOff?.(peer);
			const joined = ctx.membership.handedOff({
				address: peer,
				thread: ctx.thread,
				threads: ctx.threads,
			});
			if (joined)
				ctx.logger.info(
					{ type: "atom_peer_joined", data: { peer } },
					`${peer} is ready and holds its customers' entries: it owns them from now on`,
				);
			else
				void sweepUntilJoined({ ctx, peer, ownerOf, marks }).catch((error) =>
					ctx.logger.warn(
						{ type: "atom_join_sweep_failed", error },
						"Could not hand the peer what this thread took while the other threads were still handing off",
					),
				);
		}
	}

	async function run(): Promise<void> {
		while (!stopped) {
			await sleep(PROBE_EVERY_MS);
			if (stopped) return;
			await probeOnce().catch((error) =>
				ctx.logger.warn(
					{ type: "atom_probe_failed", error },
					"Could not probe the peers' readiness; trying again",
				),
			);
		}
	}

	return {
		probeOnce,
		run,
		stop: () => {
			stopped = true;
		},
	};
};
