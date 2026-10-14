import type { Context } from "hono";
import { LeavingAnnouncementSchema } from "../../replicas/handover/leavingContract.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

/** A peer announces it is leaving: it owns nothing from now on, on every thread of this replica at once. */
export const receiveLeaving = ({
	ctx,
}: {
	ctx: Pick<AtomHttpContext, "peer">;
}) =>
	function receive(context: Context<AtomHttpEnv>) {
		const parsed = LeavingAnnouncementSchema.safeParse(context.get("body"));
		if (!parsed.success)
			return context.json(
				{
					message: "A leaving announcement names its address",
					code: "invalid_request",
				},
				400,
			);
		const { address, handedOff } = parsed.data;
		if (handedOff)
			ctx.peer.membership?.handoffCompleted({
				address,
				threads: handedOff.threads,
			});
		else ctx.peer.membership?.markLeaving(address);
		return context.json({ left: address });
	};
