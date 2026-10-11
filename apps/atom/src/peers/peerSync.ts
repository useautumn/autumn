import type { AutumnLogger } from "@autumn/logging";
import type { Slots, SubjectSource } from "../slots/types/slots.js";
import {
	storedSubjectToWire,
	wireToStoredSubject,
} from "../threads/owners/ownerCallContract.js";
import type { StoredSubjectOnWire } from "../threads/owners/types/ownerCall.js";
import {
	PEER_RELAYED_HEADER,
	PEER_SIGNATURE_HEADER,
	signPeerBody,
} from "./peerSignature.js";
import type { PeerRelay } from "./types/peerRelay.js";

export const PEER_SUBJECTS_SINCE_PATH = "/v1/_peer/subjects.since";
const SYNC_TIMEOUT_MS = 10_000;
/** A peer that fails to answer is tried this many times before the replica serves from what it has. */
const SYNC_ATTEMPTS = 3;

export type SubjectsSinceRequest = {
	slot: number;
	slotCount: number;
	readAtAfter: number;
	limit: number;
};
export type SubjectsSinceResponse = { subjects: StoredSubjectOnWire[] };

export const subjectsSinceResponse = (
	subjects: Parameters<typeof storedSubjectToWire>[0][],
): SubjectsSinceResponse => ({
	subjects: subjects.map(storedSubjectToWire),
});

/** One peer as a subject source: the request signed like a relayed push, the answer read back into subjects. */
const peerSource =
	({
		peer,
		port,
		tokenHash,
	}: {
		peer: string;
		port: number;
		tokenHash: string;
	}): SubjectSource =>
	async (params) => {
		const body = JSON.stringify(params satisfies SubjectsSinceRequest);
		const res = await fetch(
			`http://${peer}:${port}${PEER_SUBJECTS_SINCE_PATH}`,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					[PEER_SIGNATURE_HEADER]: signPeerBody({ tokenHash, body }),
					[PEER_RELAYED_HEADER]: "1",
				},
				body,
				signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
			},
		);
		if (!res.ok)
			throw new Error(`Peer ${peer} answered ${res.status} to subjects.since`);
		const { subjects } = (await res.json()) as SubjectsSinceResponse;
		return subjects.map(wireToStoredSubject);
	};

/**
 * Before a thread serves: copies from the first peer that answers everything newer than its slots hold. With no
 * peer there is nothing to copy; with peers that never answer, it serves anyway, so two replicas restarting at once
 * cannot wait on each other forever.
 */
export const catchUpFromPeers = async ({
	ctx,
	slots,
}: {
	ctx: {
		relay: PeerRelay;
		port: number;
		tokenHash: string;
		logger: Pick<AutumnLogger, "info" | "warn">;
	};
	slots: Slots;
}): Promise<void> => {
	const startedAt = performance.now();
	for (let attempt = 1; attempt <= SYNC_ATTEMPTS; attempt++) {
		const peers = await ctx.relay.peers();
		if (peers.length === 0) {
			ctx.logger.info(
				{ type: "atom_catch_up", data: { peers: 0 } },
				"No peer to catch up from",
			);
			return;
		}
		for (const peer of peers) {
			try {
				const result = await slots.catchUp({
					source: peerSource({
						peer,
						port: ctx.port,
						tokenHash: ctx.tokenHash,
					}),
				});
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
		await Bun.sleep(1000 * attempt);
	}
	ctx.logger.warn(
		{ type: "atom_catch_up_skipped" },
		"No peer answered; serving from what is held",
	);
};
