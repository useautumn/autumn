import { z } from "zod/v4";

export const PEER_ANNOUNCEMENT_PATH = "/v1/_peer/announcement";

/**
 * What a replica tells a peer about an ownership change: it stops owning (leaving) or counts the peer as an owner
 * (joining); then, per thread, that it handed everything it owed (handedOff), so the peer stops waiting.
 */
export const AnnouncementSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("leaving"), address: z.string().min(1) }),
	z.object({ kind: z.literal("joining"), address: z.string().min(1) }),
	z.object({
		kind: z.literal("handedOff"),
		address: z.string().min(1),
		thread: z.number().int().nonnegative(),
		threads: z.number().int().positive(),
	}),
]);

export type Announcement = z.infer<typeof AnnouncementSchema>;
