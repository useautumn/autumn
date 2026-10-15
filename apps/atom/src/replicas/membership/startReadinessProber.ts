import { announceTo } from "../handover/announceTo.js";
import { handOverOnce } from "../handover/handOverOnce.js";
import type { HandoverContext } from "../handover/types/handoverContext.js";
import { readyBootOf } from "./readyBootOf.js";

/** How often each thread looks at the peers the service name lists. */
export const PROBE_EVERY_MS = 1_000;
/** A listed peer that has answered no probe for this long is worth a line: both replicas may be owning everything. */
const UNPROBED_WARN_MS = 60_000;

export type ReadinessProberContext = HandoverContext & {
	sleep?: (ms: number) => Promise<unknown>;
	/** A test seam: told each peer this thread handed over to. */
	onHandedOff?: (peer: string) => void;
};

/**
 * A listed peer counts as an owner the moment it answers ready, for every thread at once; then this thread grants it,
 * hands it what it owes its customers once, and says so. A new boot goes through the same; a dropped peer is forgotten.
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
	/** The boot each peer was last handed over to from this thread: it is not handed to again until it boots anew. */
	const handedTo = new Map<string, string>();
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

	/** Counted first, so its customers hop to it from now on; granted, then handed what they are owed. */
	async function joinPeer({
		peer,
		boot,
	}: {
		peer: string;
		boot: string;
	}): Promise<void> {
		if (ctx.membership.markJoined({ address: peer, boot }))
			ctx.logger.info(
				{ type: "atom_peer_joined", data: { peer, boot } },
				`${peer} is ready: it owns its customers from now on`,
			);
		const granted = await announceTo({
			ctx,
			peer,
			announcement: { kind: "joining", address: ctx.ring.self },
		});
		if (!granted)
			ctx.logger.warn(
				{ type: "atom_grant_unannounced", data: { peer } },
				"The joining peer did not take the grant; it hops its customers' public requests back here until the next probe repeats it",
			);
		const { handed, kept, told } = await handOverOnce({ ctx, peers: [peer] });
		ctx.onHandedOff?.(peer);
		if (granted && told.length === 1) handedTo.set(peer, boot);
		ctx.logger.info(
			{ type: "atom_peer_handed", data: { peer, boot, handed, kept } },
			`Handed ${peer} the entries its customers were owed`,
		);
	}

	/** Dropped by the name and answering from no boot this replica knows: gone, so its row is cleared. */
	async function forgetGone(peer: string): Promise<void> {
		const boot = await readyBootOf({ ctx, peer });
		if (boot !== null && ctx.membership.isBootOf({ address: peer, boot }))
			return;
		seen.delete(peer);
		handedTo.delete(peer);
		ctx.membership.forget(peer);
	}

	async function probeOnce(): Promise<void> {
		const listed = (await ctx.replication.peers().catch(() => [])).filter(
			(peer) => peer !== ctx.ring.self,
		);
		for (const peer of seen) if (!listed.includes(peer)) await forgetGone(peer);
		for (const peer of listed) {
			seen.add(peer);
			const boot = await readyBootOf({ ctx, peer });
			if (boot === null) {
				if (ctx.membership.stateOf(peer) === null) noteUnready(peer);
				continue;
			}
			unreadySince.delete(peer);
			// Leaving and still answering from the boot that left: draining, not back.
			if (
				ctx.membership.isLeaving(peer) &&
				ctx.membership.isBootOf({ address: peer, boot })
			)
				continue;
			if (handedTo.get(peer) === boot) continue;
			await joinPeer({ peer, boot });
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
