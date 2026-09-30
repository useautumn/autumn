import { hashToken } from "../auth/hashToken.js";
import type { Auth } from "../auth/types/auth.js";
import { openSlots } from "../slots/openSlots.js";
import type { Slots } from "../slots/types/slots.js";
import {
	atomFolderPath,
	type DevAtom,
	listDevAtoms,
	removeAtomFolder,
	writeDevAtom,
} from "./atomFolders.js";

/** A dev stack's one Atom process stands in for every org's deployment: each gets a token and a folder of its own. */
export type DevAuth = Auth & {
	/** Putting an Atom that exists only replaces its token hash; its customers stay. */
	putAtom(params: DevAtom): void;
	hasAtom(params: { id: string }): boolean;
	/** Deletes the Atom's folder. Removing one that is not held is a no-op. */
	removeAtom(params: { id: string }): void;
};

type HeldAtom = DevAtom & { slots: Slots };

export const createDevAuth = ({
	dataDir,
	slotCount,
}: {
	dataDir: string;
	slotCount: number;
}): DevAuth => {
	const heldById = new Map<string, HeldAtom>();
	const heldByTokenHash = new Map<string, HeldAtom>();

	function hold(held: HeldAtom): void {
		heldById.set(held.id, held);
		heldByTokenHash.set(held.tokenHash, held);
	}

	function open(devAtom: DevAtom): void {
		const folder = atomFolderPath({ dataDir, id: devAtom.id });
		hold({ ...devAtom, slots: openSlots({ folder, slotCount }) });
	}

	function authorize({ token }: { token: string }): Slots | null {
		return heldByTokenHash.get(hashToken({ token }))?.slots ?? null;
	}

	function putAtom(devAtom: DevAtom): void {
		const held = heldById.get(devAtom.id);
		if (held?.tokenHash === devAtom.tokenHash) return;

		writeDevAtom({ dataDir, devAtom });
		if (!held) {
			open(devAtom);
			return;
		}
		// The same folder under a new token: the old one stops working at once.
		heldByTokenHash.delete(held.tokenHash);
		hold({ ...held, tokenHash: devAtom.tokenHash });
	}

	function hasAtom({ id }: { id: string }): boolean {
		return heldById.has(id);
	}

	function removeAtom({ id }: { id: string }): void {
		const held = heldById.get(id);
		if (held) {
			held.slots.close();
			heldById.delete(id);
			heldByTokenHash.delete(held.tokenHash);
		}
		removeAtomFolder({ dataDir, id });
	}

	function close(): void {
		for (const held of heldById.values()) held.slots.close();
		heldById.clear();
		heldByTokenHash.clear();
	}

	for (const devAtom of listDevAtoms({ dataDir })) open(devAtom);

	return { authorize, putAtom, hasAtom, removeAtom, close };
};
