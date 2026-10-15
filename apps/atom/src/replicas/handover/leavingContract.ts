import { z } from "zod/v4";

export const PEER_LEAVING_PATH = "/v1/_peer/leaving";

/** What a replica tells its peers as it starts to stop: the address they list it under is no owner any more; then, from
 * each of its threads, that it has handed everything it owed, so the peers stop waiting for handoffs. */
export const LeavingAnnouncementSchema = z.object({
	address: z.string().min(1),
	handedOff: z.object({ threads: z.number().int().positive() }).optional(),
});

export type LeavingAnnouncement = z.infer<typeof LeavingAnnouncementSchema>;
