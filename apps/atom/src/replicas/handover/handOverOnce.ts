import { waitForInFlight } from "../../processor/ownership/inFlightRequests.js";
import { announceTo } from "./announceTo.js";
import { handOffJournals } from "./handOffJournals.js";
import type { HandoverContext } from "./types/handoverContext.js";

/** A request still being decided past this keeps its entries here: Autumn takes them from this replica's journal, as any unsent entry. */
const IN_FLIGHT_WAIT_MS = 2_000;

/**
 * One thread's side of an ownership change, once the ring no longer names this replica for the moving customers: the
 * requests in flight finish (or are refused and re-hopped), everything owed is handed to the owners in one pass, then
 * each peer is told this thread handed everything, so it stops waiting for handoffs.
 */
export const handOverOnce = async ({
	ctx,
	peers,
}: {
	ctx: Pick<
		HandoverContext,
		"ring" | "folders" | "thread" | "threads" | "peer" | "logger"
	>;
	peers: string[];
}): Promise<{ handed: number; kept: number; told: string[] }> => {
	if (!(await waitForInFlight({ withinMs: IN_FLIGHT_WAIT_MS })))
		ctx.logger.warn(
			{ type: "atom_handover_in_flight", data: { peers } },
			"Handing over with requests still in flight: what they append stays here and reaches Autumn from this replica",
		);
	const { handed, kept } = await handOffJournals({ ctx });
	const told = await Promise.all(
		peers.map((peer) =>
			announceTo({
				ctx,
				peer,
				announcement: {
					kind: "handedOff",
					address: ctx.ring.self,
					thread: ctx.thread,
					threads: ctx.threads,
				},
			}),
		),
	);
	return { handed, kept, told: peers.filter((_, index) => told[index]) };
};
