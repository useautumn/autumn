import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import { timeStage } from "../../threads/stats/stageClock.js";
import type { ReplicatedOperation } from "../types/replicatedOperation.js";
import { peerRequestHeaders } from "./peerSignature.js";

const DELIVERY_TIMEOUT_MS = 2_000;

/** Taken, refused for good (the peer will never apply this body), or not taken yet (try again). */
export type Delivery = "delivered" | "rejected" | "failed";

export type PeerSender = (params: {
	peer: string;
	path: string;
	operation: ReplicatedOperation;
}) => Promise<Delivery>;

/** Only a body the peer could read and refused is final; any other answer, a 401 or a 5xx included, is tried again. */
const REJECTED_STATUSES = new Set([400, 422]);

export const createPeerSender = ({
	ctx,
}: {
	ctx: { secret: string; port: number; fetch?: typeof fetch };
}): PeerSender =>
	async function sendToPeer({ peer, path, operation }) {
		const send = ctx.fetch ?? fetch;
		try {
			const response = await timeStage("relaySend", () =>
				send(`http://${peer}:${ctx.port}${path}`, {
					method: "POST",
					headers: peerRequestHeaders({
						secret: ctx.secret,
						method: "POST",
						path,
						customerId: operation.headers?.[ATOM_CUSTOMER_ID_HEADER],
						atomId: operation.atomId,
						body: operation.body,
						headers: operation.headers,
					}),
					body: operation.body,
					signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
				}),
			);
			await response.text();
			if (response.ok) return "delivered";
			return REJECTED_STATUSES.has(response.status) ? "rejected" : "failed";
		} catch {
			return "failed";
		}
	};
