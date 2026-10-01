import { z } from "zod/v4";

/** The pushes Autumn queues, named after the HTTP routes that take the same body. */
export const PushType = {
	SetSubject: "subjects.set",
	SetCatalog: "catalog.set",
} as const;

/** One queue message: which push, and its body exactly as the route takes it. */
const pushMessageSchema = z.object({
	type: z.enum([PushType.SetSubject, PushType.SetCatalog]),
	body: z.unknown(),
});

export type PushMessage = z.infer<typeof pushMessageSchema>;

export const queuePayloadToPushMessage = ({
	payload,
}: {
	payload: string;
}): PushMessage => pushMessageSchema.parse(JSON.parse(payload));
