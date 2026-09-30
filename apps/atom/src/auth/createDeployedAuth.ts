import { timingSafeEqual } from "node:crypto";
import { openSlots } from "../slots/openSlots.js";
import { hashToken } from "./hashToken.js";
import type { Auth } from "./types/auth.js";

/** An Atom in an org's cloud: one token, set at deploy by its hash, opens the one data folder. */
export const createDeployedAuth = ({
	dataDir,
	tokenHash,
}: {
	dataDir: string;
	tokenHash: string;
}): Auth => {
	const slots = openSlots({ folder: dataDir });
	const expectedHash = Buffer.from(tokenHash, "hex");

	function authorize({ token }: { token: string }) {
		const sentHash = Buffer.from(hashToken({ token }), "hex");
		return timingSafeEqual(sentHash, expectedHash) ? slots : null;
	}

	return { authorize, close: () => slots.close() };
};
