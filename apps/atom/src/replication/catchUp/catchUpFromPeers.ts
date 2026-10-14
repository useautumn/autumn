import type { AutumnLogger } from "@autumn/logging";
import type { ReplicaFolder, ReplicaFolders } from "../types/replicaFolders.js";
import type { Replication } from "../types/replication.js";
import {
	createPeerSubjectSource,
	listPeerAtoms,
	PeerNotReadyError,
} from "./fetchSince.js";

const BOOT_ATTEMPTS = 3;
export const SETTLE_CATCH_UPS_MS = [10_000, 30_000, 60_000];

export type CatchUpContext = {
	replication: Pick<Replication, "peers">;
	port: number;
	secret: string;
	logger: Pick<AutumnLogger, "info" | "warn">;
	sleep?: (ms: number) => Promise<unknown>;
	fetch?: typeof fetch;
};

type CatchUpResult = {
	peer: string;
	folders: number;
	slots: number;
	written: number;
	ms: number;
};

const catchUpFrom = async ({
	ctx,
	folders,
	peer,
	windowOf,
}: {
	ctx: CatchUpContext;
	folders: ReplicaFolders;
	peer: string;
	windowOf: (folder: ReplicaFolder) => number | null;
}): Promise<CatchUpResult> => {
	const startedAt = performance.now();
	const peerContext = {
		peer,
		port: ctx.port,
		secret: ctx.secret,
		fetch: ctx.fetch,
	};
	folders.learn({ tenants: await listPeerAtoms({ ctx: peerContext }) });
	const result = { peer, folders: 0, slots: 0, written: 0 };
	for (const folder of folders.all()) {
		const source = createPeerSubjectSource({
			ctx: { ...peerContext, atomId: folder.atomId },
		});
		const copied = await folder.slots.catchUp({
			source,
			window: windowOf(folder),
		});
		result.folders += 1;
		result.slots += copied.slots;
		result.written += copied.written;
	}
	return { ...result, ms: Math.round(performance.now() - startedAt) };
};

const describe = (result: CatchUpResult) =>
	`Caught up from ${result.peer}: ${result.written} subjects written across ${result.slots} slots in ${result.folders} folders`;

export const catchUpBeforeServing = async ({
	ctx,
	folders,
	windowOf,
}: {
	ctx: CatchUpContext;
	folders: ReplicaFolders;
	windowOf: (folder: ReplicaFolder) => number | null;
}): Promise<void> => {
	const sleep = ctx.sleep ?? Bun.sleep;
	for (let attempt = 1; attempt <= BOOT_ATTEMPTS; attempt++) {
		const peers = await ctx.replication.peers();
		if (peers.length === 0) {
			ctx.logger.info(
				{ type: "atom_catch_up", data: { peers: 0 } },
				"No peer to catch up from",
			);
			return;
		}
		for (const peer of peers) {
			try {
				const result = await catchUpFrom({ ctx, folders, peer, windowOf });
				ctx.logger.info(
					{ type: "atom_catch_up", data: { attempt, ...result } },
					describe(result),
				);
				return;
			} catch (error) {
				const type =
					error instanceof PeerNotReadyError
						? "atom_catch_up_peer_not_ready"
						: "atom_catch_up_failed";
				ctx.logger.warn(
					{ type, error, data: { peer, attempt } },
					"Could not catch up from a peer",
				);
			}
		}
		await sleep(1_000 * attempt);
	}
	ctx.logger.warn(
		{ type: "atom_catch_up_skipped" },
		"No ready peer answered; serving from what is held",
	);
};

export const catchUpFromEveryPeer = async ({
	ctx,
	folders,
	windowFor,
}: {
	ctx: CatchUpContext;
	folders: ReplicaFolders;
	windowFor: (peer: string) => number;
}): Promise<string[]> => {
	const caughtUp: string[] = [];
	for (const peer of await ctx.replication.peers()) {
		try {
			const result = await catchUpFrom({
				ctx,
				folders,
				peer,
				windowOf: () => windowFor(peer),
			});
			caughtUp.push(peer);
			if (result.written > 0)
				ctx.logger.info(
					{ type: "atom_catch_up", data: result },
					describe(result),
				);
		} catch (error) {
			if (error instanceof PeerNotReadyError) continue;
			ctx.logger.warn(
				{ type: "atom_catch_up_failed", error, data: { peer } },
				"Could not catch up from a peer",
			);
		}
	}
	return caughtUp;
};
