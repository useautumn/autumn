import { gunzipSync, gzipSync } from "node:zlib";
import { z } from "zod/v4";

/** The pushes Autumn queues, named after the Atom HTTP routes that take the same body. */
export const AtomPushType = {
	SetSubject: "subjects.set",
	SetCatalog: "catalog.set",
} as const;

export type AtomPushType = (typeof AtomPushType)[keyof typeof AtomPushType];

/** alien's limit on one queue message, in UTF-8 bytes. */
export const ATOM_PUSH_MAX_BYTES = 65_536;

/** One queued push: its route, the folder it lands in on a multi-tenant Atom (null on an org's own), and the route's body. */
export type AtomPushMessage = {
	type: AtomPushType;
	atomId: string | null;
	/** When Autumn read what the body holds, in epoch ms: the Atom measures queue lag from it. */
	readAt: number;
	body: unknown;
};

/** A gzip body travels as base64, since a queue message must be text. */
const envelopeSchema = z.object({
	type: z.enum([AtomPushType.SetSubject, AtomPushType.SetCatalog]),
	atom: z.string().min(1).nullable(),
	read_at: z.number().int().nonnegative(),
	enc: z.literal("gzip"),
	body: z.string(),
});

export const atomPushMessageToPayload = ({
	message,
}: {
	message: AtomPushMessage;
}): string =>
	JSON.stringify({
		type: message.type,
		atom: message.atomId,
		read_at: message.readAt,
		enc: "gzip",
		body: gzipSync(JSON.stringify(message.body)).toString("base64"),
	} satisfies z.infer<typeof envelopeSchema>);

/** Throws on a payload no Autumn sent: it will never apply, however often it is delivered. */
export const payloadToAtomPushMessage = ({
	payload,
}: {
	payload: string;
}): AtomPushMessage => {
	const envelope = envelopeSchema.parse(JSON.parse(payload));
	return {
		type: envelope.type,
		atomId: envelope.atom,
		readAt: envelope.read_at,
		body: JSON.parse(
			gunzipSync(Buffer.from(envelope.body, "base64")).toString(),
		),
	};
};
