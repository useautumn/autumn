import type { AutumnLogger } from "@autumn/logging";
import type { Slots } from "../../slots/types/slots.js";
import type { Replication } from "../types/replication.js";
import { createPeerSubjectSource, PeerNotReadyError } from "./fetchSince.js";

/** Before serving: a peer that fails to answer is tried this many times, then the replica serves from what it has. */
const BOOT_ATTEMPTS = 3;
/** After the first catch-up: waits before each further pass, while the other replicas learn this one's address. */
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
	slots: number;
	written: number;
	ms: number;
};

const catchUpFrom = async ({
	ctx,
	slots,
	peer,
	window,
}: {
	ctx: CatchUpContext;
	slots: Slots;
	peer: string;
	window: number | null;
}): Promise<CatchUpResult> => {
	const startedAt = performance.now();
	const source = createPeerSubjectSource({
		ctx: { peer, port: ctx.port, secret: ctx.secret, fetch: ctx.fetch },
	});
	const result = await slots.catchUp({ source, window });
	return { peer, ...result, ms: Math.round(performance.now() - startedAt) };
};

/**
 * Before this replica serves: copies from the first ready peer that answers what its slots lack, everything on a fresh
 * volume. With no peer there is nothing to copy; with none ready or answering it gives up after a few tries, so two
 * replicas restarting at once cannot wait on each other.
 */
export const catchUpBeforeServing = async ({
	ctx,
	slots,
	window,
}: {
	ctx: CatchUpContext;
	slots: Slots;
	window: number | null;
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
				const result = await catchUpFrom({ ctx, slots, peer, window });
				ctx.logger.info(
					{ type: "atom_catch_up", data: { attempt, ...result } },
					`Caught up from ${peer}: ${result.written} subjects written across ${result.slots} slots`,
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

/**
 * After serving: copies from every ready peer what it wrote in its last `windowFor(peer)` ms, so what one of them
 * alone holds reaches here. Resolves to the peers caught up from; one not ready or unreachable is not among them.
 */
export const catchUpFromEveryPeer = async ({
	ctx,
	slots,
	windowFor,
}: {
	ctx: CatchUpContext;
	slots: Slots;
	windowFor: (peer: string) => number;
}): Promise<string[]> => {
	const caughtUp: string[] = [];
	for (const peer of await ctx.replication.peers()) {
		try {
			const result = await catchUpFrom({
				ctx,
				slots,
				peer,
				window: windowFor(peer),
			});
			caughtUp.push(peer);
			if (result.written > 0)
				ctx.logger.info(
					{ type: "atom_catch_up", data: result },
					`Caught up from ${peer}: ${result.written} subjects written across ${result.slots} slots`,
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
