import { createHmac, timingSafeEqual } from "node:crypto";

/** A request from another replica proves it with the deployment's own peer secret, which Autumn never holds. */
export const PEER_SIGNATURE_HEADER = "x-atom-peer-signature";
/** Marks an operation a replica passed on, so the receiver applies it and passes it no further. */
export const PEER_RELAYED_HEADER = "x-atom-relayed";

export type SignedRequest = {
	method: string;
	path: string;
	/** The customer a subject push is routed by; "" for a request that names none. */
	customerId?: string;
	body: string;
};

/** Over the method, path, routed customer and body, so a signed body cannot be replayed to another route or customer. */
export const signPeerRequest = ({
	secret,
	method,
	path,
	customerId = "",
	body,
}: SignedRequest & { secret: string }): string =>
	createHmac("sha256", secret)
		.update(`${method.toUpperCase()}\n${path}\n${customerId}\n`)
		.update(body)
		.digest("hex");

export const peerSignatureMatches = ({
	secret,
	signature,
	...request
}: SignedRequest & { secret: string; signature: string }): boolean => {
	const expected = Buffer.from(signPeerRequest({ secret, ...request }), "hex");
	const given = Buffer.from(signature, "hex");
	return given.length === expected.length && timingSafeEqual(given, expected);
};

/** The headers every request to a peer carries, over the kind's own. */
export const peerRequestHeaders = ({
	secret,
	method,
	path,
	customerId,
	body,
	headers = {},
}: SignedRequest & {
	secret: string;
	headers?: Record<string, string>;
}): Record<string, string> => ({
	"content-type": "application/json",
	...headers,
	[PEER_SIGNATURE_HEADER]: signPeerRequest({
		secret,
		method,
		path,
		customerId,
		body,
	}),
	[PEER_RELAYED_HEADER]: "1",
});
