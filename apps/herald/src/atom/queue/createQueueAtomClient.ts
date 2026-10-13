import {
	ATOM_PUSH_MAX_BYTES,
	type AtomPushMessage,
	AtomPushType,
	atomPushMessageToPayload,
} from "@autumn/byoc";
import type { AutumnLogger } from "@autumn/logging";
import { toAtomCatalogBody } from "../atomCatalogBody.js";
import type { AtomClient } from "../types/atomClient.js";
import type { AtomPushQueue } from "./types/atomPushQueue.js";

type QueueAtomClientContext = {
	pushQueue: AtomPushQueue;
	/** Takes a push too big for one queue message; null where pushes go over the queue only, so such a push fails. */
	http: AtomClient | null;
	logger: Pick<AutumnLogger, "warn">;
};

const push = async ({
	ctx,
	message,
	sendOverHttp,
}: {
	ctx: QueueAtomClientContext;
	message: AtomPushMessage;
	sendOverHttp: (http: AtomClient) => Promise<void>;
}): Promise<void> => {
	const payload = atomPushMessageToPayload({ message });
	const bytes = Buffer.byteLength(payload);
	if (bytes <= ATOM_PUSH_MAX_BYTES) return ctx.pushQueue.send({ payload });
	if (!ctx.http)
		throw new Error(
			`A ${message.type} push of ${bytes} bytes is too big for the Atom's queue, and pushes go over the queue only`,
		);
	ctx.logger.warn(
		{
			type: "herald_atom_push_oversized",
			data: { pushType: message.type, bytes },
		},
		"A push is too big for the Atom's queue; it goes over HTTP",
	);
	return sendOverHttp(ctx.http);
};

/** The same pushes as the HTTP client, through the Atom's own queue: nothing has to reach the Atom from outside. */
export const createQueueAtomClient = ({
	ctx,
	atomId,
}: {
	ctx: QueueAtomClientContext;
	atomId: string | null;
}): AtomClient => ({
	setSubject: ({ body }) =>
		push({
			ctx,
			message: {
				type: AtomPushType.SetSubject,
				atomId,
				customerId: body.state.identity.customerId,
				body,
			},
			sendOverHttp: (http) => http.setSubject({ body }),
		}),
	deleteSubject: ({ body }) =>
		push({
			ctx,
			message: {
				type: AtomPushType.DeleteSubject,
				atomId,
				customerId: body.identity.customerId,
				body,
			},
			sendOverHttp: (http) => http.deleteSubject({ body }),
		}),
	setCatalog: ({ rows, readAt }) =>
		push({
			ctx,
			message: {
				type: AtomPushType.SetCatalog,
				atomId,
				customerId: null,
				body: toAtomCatalogBody({ rows, readAt }),
			},
			sendOverHttp: (http) => http.setCatalog({ rows, readAt }),
		}),
});
