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

/** The customer a `subjects.set` over HTTP is for: the Atom routes on it without parsing the body. */
export const ATOM_CUSTOMER_ID_HEADER = "x-atom-customer-id";

/** One queued push: its route, the folder it lands in on a multi-tenant Atom (null on an org's own), and the route's body. */
export type AtomPushMessage = {
	type: AtomPushType;
	atomId: string | null;
	/** The customer a subject push is for, so the Atom routes it unparsed; null for a catalog push. */
	customerId: string | null;
	body: unknown;
};

/** A queued push as the Atom reads it: the body stays JSON text until the slot that applies it parses it. */
export type QueuedAtomPush = Omit<AtomPushMessage, "body"> & { body: string };

/** A gzip body travels as base64, since a queue message must be text. */
const envelopeSchema = z.object({
	type: z.enum([AtomPushType.SetSubject, AtomPushType.SetCatalog]),
	atom: z.string().min(1).nullable(),
	customer: z.string().min(1).nullable(),
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
		customer: message.customerId,
		enc: "gzip",
		body: gzipSync(JSON.stringify(message.body)).toString("base64"),
	} satisfies z.infer<typeof envelopeSchema>);

/** Throws on a payload no Autumn sent: it will never apply, however often it is delivered. */
export const payloadToQueuedAtomPush = ({
	payload,
}: {
	payload: string;
}): QueuedAtomPush => {
	const envelope = envelopeSchema.parse(JSON.parse(payload));
	return {
		type: envelope.type,
		atomId: envelope.atom,
		customerId: envelope.customer,
		body: gunzipSync(Buffer.from(envelope.body, "base64")).toString(),
	};
};
