import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import type { Context } from "hono";
import { MOVED_FROM_HEADER } from "../../replicas/handover/handoffContract.js";
import {
	PEER_FOLDER_HEADER,
	peerRequestHeaders,
} from "../../replication/transport/peerSignature.js";
import {
	newRequestId,
	OCCURRED_AT_HEADER,
	REQUEST_ID_HEADER,
} from "../handlers/receiveCheck.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";
import { forwardRequest } from "./forwardRequest.js";

/** Tells a caller, and a test, whose view answered: the customer's owner, or a ready peer while this replica starts. */
export const PROXIED_HEADER = "x-atom-proxied";
/** A ready peer answers in a few ms, or forwards to the API itself; past this it may still be acting on the request, so it is not run again here. */
const PROXY_TIMEOUT_MS = 2_000;

/** Failures that prove the peer never got the request; any other may have, and a request that deducts must never run twice. */
const NEVER_REACHED_PEER = new Set([
	"ECONNREFUSED",
	"ConnectionRefused",
	"ENOTFOUND",
	"DNSNotFound",
	"EAI_AGAIN",
	"EHOSTUNREACH",
	"ENETUNREACH",
	"FailedToOpenSocket",
]);

const neverReachedPeer = (error: unknown): boolean =>
	NEVER_REACHED_PEER.has(String((error as { code?: unknown })?.code));

export type Hop = {
	to: string;
	answeredBy: "owner" | "starting";
	/** The peer the customer came from, when it moved to `to`: named so the owner waits for that peer's handoff. */
	movedFrom?: string | null;
};

/** The peer may have answered Autumn already, so the request is not run again here or by the API. */
export class PeerTimeout extends Error {}

/** The peer's reply, or null when it was never reached; throws PeerTimeout for a peer that may have acted on the request. */
export const hopToPeer = async ({
	ctx,
	context,
	hop,
}: {
	ctx: Pick<AtomHttpContext, "peer">;
	context: Context<AtomHttpEnv>;
	hop: Hop;
}): Promise<Response | null> => {
	const { peer } = ctx;
	const { pathname, search } = new URL(context.req.url);
	const body = await context.req.text();
	try {
		return await forwardRequest({
			context,
			target: `http://${hop.to}:${peer.port}${pathname}${search}`,
			// Only a replica names a routed customer, folder or source; a client's would break the signature.
			heldBack: [
				ATOM_CUSTOMER_ID_HEADER,
				PEER_FOLDER_HEADER,
				MOVED_FROM_HEADER,
			],
			headers: peerRequestHeaders({
				secret: peer.secret,
				method: context.req.method,
				path: pathname,
				body,
				headers: {
					[REQUEST_ID_HEADER]: newRequestId(),
					[OCCURRED_AT_HEADER]: String(Date.now()),
					...(hop.movedFrom && { [MOVED_FROM_HEADER]: hop.movedFrom }),
				},
			}),
			replyHeaders: { [PROXIED_HEADER]: hop.answeredBy },
			timeoutMs: PROXY_TIMEOUT_MS,
			send: peer.fetch,
		});
	} catch (error) {
		if (neverReachedPeer(error)) return null;
		context.set("failure", {
			code: "atom_peer_timeout",
			error: error as Error,
			target: hop.to,
		});
		throw new PeerTimeout();
	}
};

export const peerTimeoutReply = (context: Context<AtomHttpEnv>) =>
	context.json(
		{
			message: "The replica answering for this one did not answer",
			code: "atom_peer_timeout",
		},
		504,
	);
