import type { AutumnLogger } from "@autumn/logging";
import type { Replication } from "../../replication/types/replication.js";
import {
	createHandoffSession,
	type HandOffContext,
	type HandoffSession,
	handOffJournals,
	releaseHandoffSession,
} from "../handover/handOffJournals.js";
import {
	handOffKeys,
	handOffKeysUpToNow,
	handOffOlderKeys,
	KEYS_BEFORE_SWITCH_MS,
	KEYS_OVERLAP_MS,
} from "../handover/handOffKeys.js";
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
/** Probes a peer waits uncounted for its customers' keys to land before it is counted without them. */
const KEY_HANDOFF_PROBES = 10;

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
	/** Probes each ready peer has waited for its keys, while a batch to it fails. */
	const keyHandoffTries = new Map<string, number>();

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
		session,
	}: {
		ctx: ReadinessProberContext;
		peer: string;
		ownerOf: (customerId: string) => Promise<string>;
		session: HandoffSession;
	}): Promise<void> {
		let sweeps = 0;
		let handed = 0;
		let locks = 0;
		const sweep = async () => {
			const swept = await handOffJournals({
				ctx,
				ownerOf,
				session,
				quiet: true,
			});
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

	/** True once the peer holds the keys of the customers moving to it, or it has waited KEY_HANDOFF_PROBES probes for them. */
	async function handOffKeysTo({
		peer,
		switchedAt,
	}: {
		peer: string;
		switchedAt: number;
	}): Promise<boolean> {
		const keys = await handOffKeysUpToNow({
			ctx,
			since: switchedAt - KEYS_BEFORE_SWITCH_MS,
			ownerOf: ({ customerId }) =>
				ctx.ring.ownerOnceJoined({ customerId, peer }),
		});
		if (keys.complete) {
			keyHandoffTries.delete(peer);
			return true;
		}
		const tries = (keyHandoffTries.get(peer) ?? 0) + 1;
		keyHandoffTries.set(peer, tries);
		if (keys.failed > 0 && tries < KEY_HANDOFF_PROBES) return false;
		keyHandoffTries.delete(peer);
		ctx.logger.warn(
			{
				type: "atom_keys_unhanded",
				data: { peer, failed: keys.failed, tries },
			},
			`${peer} is counted without every caller key of the customers moving to it: a retry there may deduct again`,
		);
		return true;
	}

	/** After the switch, in the background: the probes go on while an hour of keys streams to the peer. */
	async function handOffOlderKeysTo({
		peer,
		switchedAt,
	}: {
		peer: string;
		switchedAt: number;
	}): Promise<void> {
		const ownerOf = ({ customerId }: { customerId: string }) =>
			ctx.ring.ownerOnceJoined({ customerId, peer });
		const since = await handOffKeys({
			ctx,
			since: switchedAt - KEYS_OVERLAP_MS,
			ownerOf,
		});
		const older = await handOffOlderKeys({ ctx, switchedAt, ownerOf });
		ctx.logger.info(
			{
				type: "atom_older_keys_handed",
				data: {
					peer,
					...older,
					sinceSwitchHanded: since.handed,
					sinceSwitchFailed: since.failed,
				},
			},
			`Handed ${peer} the older caller keys of the customers moving to it`,
		);
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
			const switchedAt = Date.now();
			const ownerOf = (customerId: string) =>
				ctx.ring.ownerOnceJoined({ customerId, peer });
			const session = createHandoffSession();
			await handOffJournals({ ctx, ownerOf, session });
			if (!(await handOffKeysTo({ peer, switchedAt }))) {
				releaseHandoffSession({ session });
				continue;
			}
			ctx.onHandedOff?.(peer);
			const joined = ctx.membership.handedOff({
				address: peer,
				thread: ctx.thread,
				threads: ctx.threads,
			});
			if (joined) {
				ctx.logger.info(
					{ type: "atom_peer_joined", data: { peer } },
					`${peer} is ready and holds its customers' entries: it owns them from now on`,
				);
				// The last thread: nothing of this thread's can be taken for the moved customers after the flip.
				await handOffJournals({ ctx, ownerOf, session, quiet: true });
				releaseHandoffSession({ session });
			}
			const swept = joined
				? Promise.resolve()
				: sweepUntilJoined({ ctx, peer, ownerOf, session })
						.catch((error) =>
							ctx.logger.warn(
								{ type: "atom_join_sweep_failed", error },
								"Could not hand the peer what this thread took while the other threads were still handing off",
							),
						)
						.finally(() => releaseHandoffSession({ session }));
			// After the sweep: keys this thread took while the other threads were still handing off move too.
			void swept
				.then(() => handOffOlderKeysTo({ peer, switchedAt }))
				.catch((error) =>
					ctx.logger.warn(
						{ type: "atom_older_keys_failed", error, data: { peer } },
						`Could not hand ${peer} the older caller keys: a retry of one there may deduct again`,
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
