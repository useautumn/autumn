import {
	type CatchUpContext,
	catchUpBeforeServing,
	catchUpFromEveryPeer,
	SETTLE_CATCH_UPS_MS,
} from "./catchUp/catchUpFromPeers.js";
import { HOLD_MS } from "./outbox/createPeerOutbox.js";
import type { ReplicaFolder, ReplicaFolders } from "./types/replicaFolders.js";
import type { Replication } from "./types/replication.js";

/** Past the relay hold: what a peer gave up delivering here is at most this old when this replica asks again. */
const CATCH_UP_MARGIN_MS = 60_000;
/** How often, once serving, a replica asks every peer for what they wrote lately; what one of them alone holds lands within this. */
export const ANTI_ENTROPY_EVERY_MS = 2 * 60_000;
/** Reaches back past the hold and one period, so a copy dropped after the hold is found by the next pass. */
export const ANTI_ENTROPY_WINDOW_MS =
	HOLD_MS + ANTI_ENTROPY_EVERY_MS + CATCH_UP_MARGIN_MS;

export type ReplicaSyncContext = CatchUpContext & {
	replication: Replication;
	now: () => number;
	isStopping: () => boolean;
};

/**
 * Keeps one thread's folders in step with the other replicas across a restart. Built before the thread listens, so the
 * point each folder fell behind at is fixed before any live relay lands and moves its files' newest write. What died with the
 * process is pulled by the peers' own passes once this replica is ready; nothing stored is ever pushed back through the push path.
 */
export const createReplicaSync = ({
	ctx,
	folders,
}: {
	ctx: ReplicaSyncContext;
	folders: ReplicaFolders;
}) => {
	const sleep = ctx.sleep ?? Bun.sleep;
	const openedAt = ctx.now();
	/** Per folder held at boot: what the peer wrote while this replica was away, and a margin past the relay hold; everything for one that is empty or learned since. */
	const lastAppliedAt = new Map(
		folders.all().map(({ atomId, slots }) => [atomId, slots.maxAppliedAt()]),
	);
	const bootWindowOf = ({ atomId }: ReplicaFolder): number | null => {
		const appliedAt = lastAppliedAt.get(atomId) ?? 0;
		return appliedAt === 0
			? null
			: openedAt - appliedAt + HOLD_MS + CATCH_UP_MARGIN_MS;
	};

	/** Before serving: from the first ready peer. */
	const catchUp = () =>
		catchUpBeforeServing({ ctx, folders, windowOf: bootWindowOf });

	/** When this replica last caught up from each peer; a peer cut off for longer than the window is asked back to then. */
	const caughtUpAt = new Map<string, number>();
	const windowFor = (peer: string) =>
		Math.max(
			ANTI_ENTROPY_WINDOW_MS,
			ctx.now() -
				(caughtUpAt.get(peer) ?? openedAt) +
				HOLD_MS +
				CATCH_UP_MARGIN_MS,
		);

	/** One pass over every ready peer for what they wrote since this replica last heard from them. */
	async function pass(): Promise<void> {
		const startedAt = ctx.now();
		for (const peer of await catchUpFromEveryPeer({ ctx, folders, windowFor }))
			caughtUpAt.set(peer, startedAt);
	}

	/** Once serving: a few passes while peers learn this address, then one every period for as long as the thread runs. */
	async function runPasses(): Promise<void> {
		const delays = [...SETTLE_CATCH_UPS_MS];
		for (;;) {
			await sleep(delays.shift() ?? ANTI_ENTROPY_EVERY_MS);
			if (ctx.isStopping()) return;
			await pass();
		}
	}

	return { catchUp, pass, runPasses };
};
