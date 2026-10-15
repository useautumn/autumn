import { waitForInFlight } from "../../processor/ownership/inFlightRequests.js";
import { announceTo } from "./announceTo.js";
import { handOffJournals } from "./handOffJournals.js";
import type { HandoverContext } from "./types/handoverContext.js";

/** A request still being decided past this keeps its entries here: Autumn takes them from this replica's journal, as any unsent entry. */
const IN_FLIGHT_WAIT_MS = 2_000;

/**
 * One thread's side of an ownership change, after the ring stopped naming this replica for the moving customers:
 * in-flight requests finish, everything owed goes to the owners in one pass, then each peer hears handedOff.
 */
export const handOverOnce = async ({
	ctx,
	peers,
}: {
	ctx: Pick<
		HandoverContext,
		"ring" | "boot" | "folders" | "thread" | "threads" | "peer" | "logger"
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
					boot: ctx.boot,
					thread: ctx.thread,
					threads: ctx.threads,
				},
			}),
		),
	);
	return { handed, kept, told: peers.filter((_, index) => told[index]) };
};
