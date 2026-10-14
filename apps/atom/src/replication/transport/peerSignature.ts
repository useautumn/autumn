import { createHmac, timingSafeEqual } from "node:crypto";

export const PEER_SIGNATURE_HEADER = "x-atom-peer-signature";
export const PEER_RELAYED_HEADER = "x-atom-relayed";
export const PEER_FOLDER_HEADER = "x-atom-folder";

export type SignedRequest = {
	method: string;
	path: string;
	customerId?: string;
	atomId?: string | null;
	body: string;
};

export const signPeerRequest = ({
	secret,
	method,
	path,
	customerId = "",
	atomId = "",
	body,
}: SignedRequest & { secret: string }): string =>
	createHmac("sha256", secret)
		.update(
			`${method.toUpperCase()}\n${path}\n${customerId}\n${atomId ?? ""}\n`,
		)
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

export const peerRequestHeaders = ({
	secret,
	method,
	path,
	customerId,
	atomId = null,
	body,
	headers = {},
}: SignedRequest & {
	secret: string;
	headers?: Record<string, string>;
}): Record<string, string> => ({
	"content-type": "application/json",
	...headers,
	...(atomId !== null && { [PEER_FOLDER_HEADER]: atomId }),
	[PEER_SIGNATURE_HEADER]: signPeerRequest({
		secret,
		method,
		path,
		customerId,
		atomId,
		body,
	}),
	[PEER_RELAYED_HEADER]: "1",
});
