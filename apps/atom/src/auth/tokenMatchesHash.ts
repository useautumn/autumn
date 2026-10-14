import { timingSafeEqual } from "node:crypto";
import { hashToken } from "./hashToken.js";

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
