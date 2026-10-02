import { openSlots } from "../slots/openSlots.js";
import type { Slots } from "../slots/types/slots.js";
import { tokenMatchesHash } from "./tokenMatchesHash.js";
import type { Auth } from "./types/auth.js";

/** A deployment holds one data folder, so what arrives without a token (Autumn's pushes) is applied to it directly. */
export type DeployedAuth = Auth & { slots: Slots };

/** An Atom in an org's cloud: one token, set at deploy by its hash, opens the one data folder. */
export const createDeployedAuth = ({
	dataDir,
	tokenHash,
	slotCount,
}: {
	dataDir: string;
	tokenHash: string;
	slotCount: number;
}): DeployedAuth => {
	const slots = openSlots({ folder: dataDir, slotCount });

	function authorize({ token }: { token: string }) {
		return tokenMatchesHash({ token, expectedHash: tokenHash }) ? slots : null;
	}

	return { authorize, slots, close: () => slots.close() };
};
