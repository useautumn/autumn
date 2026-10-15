import { z } from "zod/v4";

export const PEER_ANNOUNCEMENT_PATH = "/v1/_peer/announcement";

/**
 * What a replica tells a peer about an ownership change, in the order a change happens: it stops owning (leaving), or
 * it counts the peer as an owner and is handing it the customers that moved (joining); then, from each of its threads,
 * that it has handed everything it owed, so the peer stops waiting for handoffs.
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
