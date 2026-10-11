import type { AutumnLogger } from "@autumn/logging";
import type { Slots } from "../../slots/types/slots.js";
import type { Replication } from "../types/replication.js";
import { createPeerSubjectSource } from "./fetchSince.js";

/** A peer that fails to answer is tried this many times before the replica serves from what it has. */
const ATTEMPTS = 3;
/** After the first catch-up: waits before each further pass, while the other replicas learn this one's address. */
export const SETTLE_CATCH_UPS_MS = [10_000, 30_000, 60_000];

type CatchUpContext = {
	replication: Pick<Replication, "peers">;
	port: number;
	tokenHash: string;
	logger: Pick<AutumnLogger, "info" | "warn">;
	sleep?: (ms: number) => Promise<unknown>;
};

/**
 * Copies from the first peer that answers everything newer than this thread's slots hold. With no peer there is
 * nothing to copy; with peers that never answer it gives up, so two replicas restarting at once cannot wait on each other.
 */
export const catchUpFromPeers = async ({
	ctx,
	slots,
}: {
	ctx: CatchUpContext;
	slots: Slots;
}): Promise<void> => {
	const sleep = ctx.sleep ?? Bun.sleep;
	const startedAt = performance.now();
	for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
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
				const source = createPeerSubjectSource({
					ctx: { peer, port: ctx.port, tokenHash: ctx.tokenHash },
				});
				const result = await slots.catchUp({ source });
				ctx.logger.info(
					{
						type: "atom_catch_up",
						data: {
							peer,
							attempt,
							...result,
							ms: Math.round(performance.now() - startedAt),
						},
					},
					`Caught up from ${peer}: ${result.written} subjects written across ${result.slots} slots`,
				);
				return;
			} catch (error) {
				ctx.logger.warn(
					{ type: "atom_catch_up_failed", error, data: { peer, attempt } },
					"Could not catch up from a peer",
				);
			}
		}
		await sleep(1_000 * attempt);
	}
	ctx.logger.warn(
		{ type: "atom_catch_up_skipped" },
		"No peer answered; serving from what is held",
	);
};
