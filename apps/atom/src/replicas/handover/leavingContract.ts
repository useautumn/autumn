import { z } from "zod/v4";

export const PEER_LEAVING_PATH = "/v1/_peer/leaving";

/** What a replica tells its peers as it starts to stop: the address they list it under is no owner any more. */
export const LeavingAnnouncementSchema = z.object({
	address: z.string().min(1),
});

export type LeavingAnnouncement = z.infer<typeof LeavingAnnouncementSchema>;
