import type { ReplicatedOperation } from "../types/replicatedOperation.js";
import { peerRequestHeaders } from "./peerSignature.js";

const DELIVERY_TIMEOUT_MS = 2_000;

export type PeerSender = (params: {
	peer: string;
	path: string;
	operation: ReplicatedOperation;
}) => Promise<boolean>;

/** Posts one operation to one peer; true when the peer took it or can never take it (a 4xx), false when it should be tried again. */
export const createPeerSender = ({
	ctx,
}: {
	ctx: { tokenHash: string; port: number };
}): PeerSender =>
	async function sendToPeer({ peer, path, operation }) {
		try {
			const response = await fetch(`http://${peer}:${ctx.port}${path}`, {
				method: "POST",
				headers: peerRequestHeaders({
					tokenHash: ctx.tokenHash,
					body: operation.body,
					headers: operation.headers,
				}),
				body: operation.body,
				signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
			});
			await response.text();
			return response.ok || (response.status >= 400 && response.status < 500);
		} catch {
			return false;
		}
	};
