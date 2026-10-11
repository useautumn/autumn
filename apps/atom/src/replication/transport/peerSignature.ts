import { createHmac, timingSafeEqual } from "node:crypto";

/** A request from another replica proves it with the token hash every replica holds; the token itself never leaves Autumn. */
export const PEER_SIGNATURE_HEADER = "x-atom-peer-signature";
/** Marks an operation a replica passed on, so the receiver applies it and passes it no further. */
export const PEER_RELAYED_HEADER = "x-atom-relayed";

export const signPeerBody = ({
	tokenHash,
	body,
}: {
	tokenHash: string;
	body: string;
}): string => createHmac("sha256", tokenHash).update(body).digest("hex");

export const peerSignatureMatches = ({
	tokenHash,
	body,
	signature,
}: {
	tokenHash: string;
	body: string;
	signature: string;
}): boolean => {
	const expected = Buffer.from(signPeerBody({ tokenHash, body }), "hex");
	const given = Buffer.from(signature, "hex");
	return given.length === expected.length && timingSafeEqual(given, expected);
};

/** The headers every request to a peer carries, over the kind's own. */
export const peerRequestHeaders = ({
	tokenHash,
	body,
	headers = {},
}: {
	tokenHash: string;
	body: string;
	headers?: Record<string, string>;
}): Record<string, string> => ({
	"content-type": "application/json",
	...headers,
	[PEER_SIGNATURE_HEADER]: signPeerBody({ tokenHash, body }),
	[PEER_RELAYED_HEADER]: "1",
});
