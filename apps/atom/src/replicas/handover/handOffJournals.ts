import type { AutumnLogger } from "@autumn/logging";
import { peerRequestHeaders } from "../../replication/transport/peerSignature.js";
import type { ReplicaFolders } from "../../replication/types/replicaFolders.js";
import type {
	HandedEntry,
	Journal,
} from "../../state/journal/types/journal.js";
import type { ReplicaRing } from "../types/replicaRing.js";
import { type Handoff, PEER_HANDOFF_PATH } from "./handoffContract.js";

/** Handoffs in flight at once per thread; each is one customer's entries, a few KB. */
const HANDOFFS_IN_FLIGHT = 32;
/** A new owner that has not taken a customer's entries by then keeps answering from its copy; the entries drain to Autumn instead. */
const HANDOFF_TIMEOUT_MS = 2_000;

export type HandOffContext = {
	ring: ReplicaRing;
	folders: Pick<ReplicaFolders, "all">;
	peer: { port: number; secret: string; fetch?: typeof fetch };
	logger: Pick<AutumnLogger, "info" | "warn">;
	sleep?: (ms: number) => Promise<unknown>;
};

type Pending = {
	journal: Journal;
	atomId: string | null;
	customerId: string;
	entries: HandedEntry[];
};

const sendHandoff = async ({
	ctx,
	owner,
	pending,
}: {
	ctx: HandOffContext;
	owner: string;
	pending: Pending;
}): Promise<boolean> => {
	const body = JSON.stringify({
		customerId: pending.customerId,
		entries: pending.entries,
	} satisfies Handoff);
	try {
		const reply = await (ctx.peer.fetch ?? fetch)(
			`http://${owner}:${ctx.peer.port}${PEER_HANDOFF_PATH}`,
			{
				method: "POST",
				headers: peerRequestHeaders({
					secret: ctx.peer.secret,
					method: "POST",
					path: PEER_HANDOFF_PATH,
					atomId: pending.atomId,
					body,
				}),
				body,
				signal: AbortSignal.timeout(HANDOFF_TIMEOUT_MS),
			},
		);
		await reply.arrayBuffer();
		return reply.ok;
	} catch {
		return false;
	}
};

/**
 * Every customer this thread's journals owe anything for, handed to the replica that owns it now, in its journal under
 * the original writer and seq; what the new owner acknowledges leaves this journal, the rest drains to Autumn as before.
 */
export const handOffJournals = async ({
	ctx,
	ownerOf = (customerId) => ctx.ring.ownerOf({ customerId }),
}: {
	ctx: HandOffContext;
	/** Who takes each customer; the ring's owner unless the caller is handing to a peer about to be counted. */
	ownerOf?: (customerId: string) => Promise<string>;
}): Promise<{ handed: number; kept: number }> => {
	const pending: Pending[] = ctx.folders
		.all()
		.flatMap(({ atomId, slots }) =>
			slots
				.ownedJournals()
				.flatMap((journal) =>
					journal
						.handoffs()
						.map((handoff) => ({ journal, atomId, ...handoff })),
				),
		);
	let handed = 0;
	let kept = 0;
	let next = 0;
	const lane = async () => {
		while (next < pending.length) {
			const item = pending[next++] as Pending;
			const owner = await ownerOf(item.customerId);
			const taken =
				owner !== ctx.ring.self &&
				(await sendHandoff({ ctx, owner, pending: item }));
			if (taken) {
				item.journal.dropHandedOff({ entries: item.entries });
				handed += item.entries.length;
			} else kept += item.entries.length;
		}
	};
	await Promise.all(Array.from({ length: HANDOFFS_IN_FLIGHT }, lane));
	ctx.logger.info(
		{ type: "atom_handoff", data: { customers: pending.length, handed, kept } },
		`Handed ${handed} owed entries to the new owners; ${kept} stay to drain to Autumn`,
	);
	return { handed, kept };
};
