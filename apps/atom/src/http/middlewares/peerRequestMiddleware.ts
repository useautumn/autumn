import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import type { Context, MiddlewareHandler, Next } from "hono";
import {
	PEER_FOLDER_HEADER,
	PEER_SIGNATURE_HEADER,
	peerSignatureMatches,
} from "../../replication/transport/peerSignature.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

export function peerRequestMiddleware({
	secret,
}: {
	secret: string;
}): MiddlewareHandler<AtomHttpEnv> {
	async function authorizePeer(context: Context<AtomHttpEnv>, next: Next) {
		const signature = context.req.header(PEER_SIGNATURE_HEADER) ?? "";
		const verified = peerSignatureMatches({
			secret,
			signature,
			method: context.req.method,
			path: context.req.path,
			customerId: context.req.header(ATOM_CUSTOMER_ID_HEADER),
			atomId: context.req.header(PEER_FOLDER_HEADER) ?? null,
			body: await context.req.text(),
		});
		if (!verified)
			return context.json(
				{ message: "Peer signature rejected", code: "atom_peer_rejected" },
				401,
			);
		context.set("relayed", true);
		await next();
	}
	return authorizePeer;
}

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
