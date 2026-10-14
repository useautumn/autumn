import {
	type CatchUpContext,
	catchUpBeforeServing,
	catchUpFromEveryPeer,
	SETTLE_CATCH_UPS_MS,
} from "./catchUp/catchUpFromPeers.js";
import { HOLD_MS } from "./outbox/createPeerOutbox.js";
import type { ReplicaFolder, ReplicaFolders } from "./types/replicaFolders.js";
import type { Replication } from "./types/replication.js";

const CATCH_UP_MARGIN_MS = 60_000;
export const ANTI_ENTROPY_EVERY_MS = 2 * 60_000;
export const ANTI_ENTROPY_WINDOW_MS =
	HOLD_MS + ANTI_ENTROPY_EVERY_MS + CATCH_UP_MARGIN_MS;

export type ReplicaSyncContext = CatchUpContext & {
	replication: Replication;
	now: () => number;
	isStopping: () => boolean;
};

export const createReplicaSync = ({
	ctx,
	folders,
}: {
	ctx: ReplicaSyncContext;
	folders: ReplicaFolders;
}) => {
	const sleep = ctx.sleep ?? Bun.sleep;
	const openedAt = ctx.now();
	const lastAppliedAt = new Map(
		folders.all().map(({ atomId, slots }) => [atomId, slots.maxAppliedAt()]),
	);
	const bootWindowOf = ({ atomId }: ReplicaFolder): number | null => {
		const appliedAt = lastAppliedAt.get(atomId) ?? 0;
		return appliedAt === 0
			? null
			: openedAt - appliedAt + HOLD_MS + CATCH_UP_MARGIN_MS;
	};

	const catchUp = () =>
		catchUpBeforeServing({ ctx, folders, windowOf: bootWindowOf });

	const caughtUpAt = new Map<string, number>();
	const windowFor = (peer: string) =>
		Math.max(
			ANTI_ENTROPY_WINDOW_MS,
			ctx.now() -
				(caughtUpAt.get(peer) ?? openedAt) +
				HOLD_MS +
				CATCH_UP_MARGIN_MS,
		);

	async function pass(): Promise<void> {
		const startedAt = ctx.now();
		for (const peer of await catchUpFromEveryPeer({ ctx, folders, windowFor }))
			caughtUpAt.set(peer, startedAt);
	}

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
