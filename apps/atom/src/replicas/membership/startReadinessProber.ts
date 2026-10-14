import type { AutumnLogger } from "@autumn/logging";
import type { Replication } from "../../replication/types/replication.js";
import {
	type HandOffContext,
	handOffJournals,
} from "../handover/handOffJournals.js";
import type { ReplicaRing } from "../types/replicaRing.js";
import type { Membership } from "./types/membership.js";

/** How often each thread looks at the peers the service name lists that are not members yet. */
export const PROBE_EVERY_MS = 1_000;
const PROBE_TIMEOUT_MS = 1_000;
/** A peer still listed this long after it announced leaving came back at the same address without the name dropping it. */
const LEAVING_TTL_MS = 60_000;
/** A listed peer that has answered no probe for this long is worth a line: both replicas may be owning everything. */
const UNPROBED_WARN_MS = 60_000;

export type ReadinessProberContext = Omit<HandOffContext, "ring"> & {
	ring: ReplicaRing;
	membership: Membership;
	replication: Pick<Replication, "peers">;
	/** The replica's threads: a peer is joined once every one of them has handed it its customers' entries. */
	threads: number;
	/** The peers' public port, where /health says whether they serve. */
	publicPort: number;
	logger: Pick<AutumnLogger, "info" | "warn">;
};

const isReady = async ({
	ctx,
	peer,
}: {
	ctx: ReadinessProberContext;
	peer: string;
}): Promise<boolean> => {
	try {
		const reply = await (ctx.peer.fetch ?? fetch)(
			`http://${peer}:${ctx.publicPort}/health`,
			{ signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) },
		);
		await reply.arrayBuffer();
		return reply.status === 200;
	} catch {
		return false;
	}
};

/**
 * A peer the service name lists is counted as an owner only once it answers ready and this thread has handed it the
 * entries of the customers that move to it; the last thread to do so flips it to joined, for every thread at once. A
 * peer the service name dropped is forgotten, so the container that comes back at its address starts over.
 */
export const startReadinessProber = ({
	ctx,
}: {
	ctx: ReadinessProberContext;
}) => {
	const sleep = ctx.sleep ?? Bun.sleep;
	/** Peers this thread has handed its entries to since they came up. */
	const handedTo = new Set<string>();
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

	async function probeOnce(): Promise<void> {
		const listed = (await ctx.replication.peers().catch(() => [])).filter(
			(peer) => peer !== ctx.ring.self,
		);
		for (const peer of handedTo)
			if (!listed.includes(peer)) {
				handedTo.delete(peer);
				ctx.membership.forget(peer);
			}
		for (const peer of listed) {
			const leavingSince = ctx.membership.leavingSince(peer);
			if (leavingSince !== null && Date.now() - leavingSince > LEAVING_TTL_MS) {
				handedTo.delete(peer);
				ctx.membership.forget(peer);
			}
			const state = ctx.membership.stateOf(peer);
			if (state === null) {
				if (await isReady({ ctx, peer })) {
					ctx.membership.markReady(peer);
					unreadySince.delete(peer);
				} else noteUnready(peer);
			}
			if (ctx.membership.stateOf(peer) !== "ready" || handedTo.has(peer))
				continue;
			await handOffJournals({
				ctx,
				ownerOf: (customerId) => ctx.ring.ownerOnceJoined({ customerId, peer }),
			});
			handedTo.add(peer);
			if (ctx.membership.handedOff({ address: peer, threads: ctx.threads }))
				ctx.logger.info(
					{ type: "atom_peer_joined", data: { peer } },
					`${peer} is ready and holds its customers' entries: it owns them from now on`,
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
