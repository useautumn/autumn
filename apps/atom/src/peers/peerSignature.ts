import { createHmac, timingSafeEqual } from "node:crypto";

/** A relayed push proves it came from a replica of this deployment: only they hold the token hash. */
export const PEER_SIGNATURE_HEADER = "x-atom-peer-signature";
/** Marks a push a replica passed on, so the receiver applies it and passes it no further. */
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
