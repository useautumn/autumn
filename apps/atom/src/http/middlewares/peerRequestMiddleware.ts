import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import type { Context, MiddlewareHandler, Next } from "hono";
import { MOVED_FROM_HEADER } from "../../replicas/handover/handoffContract.js";
import {
	PEER_FOLDER_HEADER,
	PEER_SIGNATURE_HEADER,
	peerSignatureMatches,
} from "../../replication/transport/peerSignature.js";
import { timeStage } from "../../threads/stats/stageClock.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

/** The routes a check another replica handed on arrives at; every other peer request relays an operation or a read. */
const HOP_PATHS = new Set(["/v1/balances.check", "/v1/track"]);

/**
 * Every request on the peer port is from another replica, signed with the deployment's own secret over its method,
 * path, routed customer, folder and body. It is marked relayed, so what it carries is applied here and passed no further.
 */
export function peerRequestMiddleware({
	secret,
}: {
	secret: string;
}): MiddlewareHandler<AtomHttpEnv> {
	async function authorizePeer(context: Context<AtomHttpEnv>, next: Next) {
		const signature = context.req.header(PEER_SIGNATURE_HEADER) ?? "";
		const body = await context.req.text();
		const verified = timeStage(
			HOP_PATHS.has(context.req.path) ? "hopServe" : "relayReceive",
			() =>
				peerSignatureMatches({
					secret,
					signature,
					method: context.req.method,
					path: context.req.path,
					customerId: context.req.header(ATOM_CUSTOMER_ID_HEADER),
					atomId: context.req.header(PEER_FOLDER_HEADER) ?? null,
					body,
				}),
		);
		if (!verified)
			return context.json(
				{ message: "Peer signature rejected", code: "atom_peer_rejected" },
				401,
			);
		context.set("relayed", true);
		// Hopped here by the customer's previous owner: its answer waits for that owner's handoff.
		const movedFrom = context.req.header(MOVED_FROM_HEADER);
		if (movedFrom) context.set("movedFrom", movedFrom);
		await next();
	}
	return authorizePeer;
}

/** The folder the peer names, as this Atom holds it: a tenant's on a multi-tenant Atom, the one folder otherwise. */
export function peerFolderMiddleware({
	ctx,
}: {
	ctx: Pick<AtomHttpContext, "auth">;
}): MiddlewareHandler<AtomHttpEnv> {
	async function openFolder(context: Context<AtomHttpEnv>, next: Next) {
		const atomId = context.req.header(PEER_FOLDER_HEADER) ?? null;
		const slots = ctx.auth.slotsFor({ atomId });
		if (!slots)
			return context.json(
				{
					message: `This replica holds no folder ${atomId ?? "of its own"}`,
					code: "atom_peer_unknown_folder",
				},
				404,
			);
		context.set("slots", slots);
		await next();
	}
	return openFolder;
}
