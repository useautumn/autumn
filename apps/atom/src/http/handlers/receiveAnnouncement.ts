import type { Context } from "hono";
import { AnnouncementSchema } from "../../replicas/handover/announcementContract.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

/** A peer announces an ownership change: the membership every thread of this replica reads takes it at once. */
export const receiveAnnouncement = ({
	ctx,
}: {
	ctx: Pick<AtomHttpContext, "peer">;
}) =>
	function receive(context: Context<AtomHttpEnv>) {
		const parsed = AnnouncementSchema.safeParse(context.get("body"));
		if (!parsed.success)
			return context.json(
				{
					message: "An announcement names its kind and address",
					code: "invalid_request",
				},
				400,
			);
		const announcement = parsed.data;
		const { membership } = ctx.peer;
		if (announcement.kind === "leaving")
			membership?.markLeaving(announcement.address);
		if (announcement.kind === "joining")
			membership?.grantedBy(announcement.address);
		if (announcement.kind === "handedOff")
			membership?.handoffCompleted(announcement);
		return context.json({ taken: announcement.kind });
	};
