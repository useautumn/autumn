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
		ctx.peer.membership?.markLeaving(parsed.data.address);
		return context.json({ left: parsed.data.address });
	};
