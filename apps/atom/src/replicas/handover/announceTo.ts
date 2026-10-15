import { peerRequestHeaders } from "../../replication/transport/peerSignature.js";
import {
	type Announcement,
	PEER_ANNOUNCEMENT_PATH,
} from "./announcementContract.js";

/** A peer that has not taken the announcement by then is treated as unreachable: the caller says so and tries again later. */
const ANNOUNCE_TIMEOUT_MS = 1_000;

export type AnnounceContext = {
	peer: { port: number; secret: string; fetch?: typeof fetch };
};

/** True once the peer took it. */
export const announceTo = async ({
	ctx,
	peer,
	announcement,
}: {
	ctx: AnnounceContext;
	peer: string;
	announcement: Announcement;
}): Promise<boolean> => {
	const body = JSON.stringify(announcement);
	try {
		const reply = await (ctx.peer.fetch ?? fetch)(
			`http://${peer}:${ctx.peer.port}${PEER_ANNOUNCEMENT_PATH}`,
			{
				method: "POST",
				headers: peerRequestHeaders({
					secret: ctx.peer.secret,
					method: "POST",
					path: PEER_ANNOUNCEMENT_PATH,
					body,
				}),
				body,
				signal: AbortSignal.timeout(ANNOUNCE_TIMEOUT_MS),
			},
		);
		await reply.arrayBuffer();
		return reply.ok;
	} catch {
		return false;
	}
};
