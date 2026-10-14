import { gunzipSync, gzipSync } from "node:zlib";
import { z } from "zod/v4";

export const AtomPushType = {
	SetSubject: "subjects.set",
	SetCatalog: "catalog.set",
	DeleteSubject: "subjects.delete",
} as const;

export type AtomPushType = (typeof AtomPushType)[keyof typeof AtomPushType];

export const ATOM_PUSH_MAX_BYTES = 65_536;

export const ATOM_CUSTOMER_ID_HEADER = "x-atom-customer-id";

export type AtomPushMessage = {
	type: AtomPushType;
	atomId: string | null;
	customerId: string | null;
	body: unknown;
};

export type QueuedAtomPush = Omit<AtomPushMessage, "body"> & { body: string };

const envelopeSchema = z.object({
	type: z.enum([
		AtomPushType.SetSubject,
		AtomPushType.SetCatalog,
		AtomPushType.DeleteSubject,
	]),
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
