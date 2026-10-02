import { timingSafeEqual } from "node:crypto";
import { hashToken } from "./hashToken.js";

/** Compared in constant time, so a wrong token's response time says nothing about the right one. */
export const tokenMatchesHash = ({
	token,
	expectedHash,
}: {
	token: string;
	expectedHash: string;
}): boolean =>
	timingSafeEqual(
		Buffer.from(hashToken({ token }), "hex"),
		Buffer.from(expectedHash, "hex"),
	);
