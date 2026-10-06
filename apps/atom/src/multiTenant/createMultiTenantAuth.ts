import { hashToken } from "../auth/hashToken.js";
import type { Auth } from "../auth/types/auth.js";
import { openSlots } from "../slots/openSlots.js";
import type { Slots } from "../slots/types/slots.js";
import {
	atomFolderPath,
	listTenantAtoms,
	removeAtomFolder,
	type TenantAtom,
	writeTenantAtom,
} from "./atomFolders.js";

/** Our one Atom process holding many orgs: each gets a token and a folder of its own. */
export type MultiTenantAuth = Auth & {
	/** Putting an Atom that exists only replaces its token hash; its customers stay. */
	putAtom(params: TenantAtom): void;
	hasAtom(params: { id: string }): boolean;
	/** Deletes the Atom's folder. Removing one that is not held is a no-op. */
	removeAtom(params: { id: string }): void;
};

/** Slots stay null until the token is first used, so an Atom nobody asks holds no files, statements or timers. */
type HeldAtom = TenantAtom & { slots: Slots | null };

export const createMultiTenantAuth = ({
	dataDir,
	slotCount,
}: {
	dataDir: string;
	slotCount: number;
}): MultiTenantAuth => {
	const heldById = new Map<string, HeldAtom>();
	const heldByTokenHash = new Map<string, HeldAtom>();

	function hold(held: HeldAtom): void {
		heldById.set(held.id, held);
		heldByTokenHash.set(held.tokenHash, held);
	}

	function slotsOf(held: HeldAtom): Slots {
		held.slots ??= openSlots({
			folder: atomFolderPath({ dataDir, id: held.id }),
			slotCount,
		});
		return held.slots;
	}

	/** One map lookup by the token's hash: no other org is read or touched. */
	function authorize({ token }: { token: string }): Slots | null {
		const held = heldByTokenHash.get(hashToken({ token }));
		return held ? slotsOf(held) : null;
	}

	/** A queued push names its folder. */
	function slotsFor({ atomId }: { atomId: string | null }): Slots | null {
		const held = atomId === null ? undefined : heldById.get(atomId);
		return held ? slotsOf(held) : null;
	}

	function putAtom(tenantAtom: TenantAtom): void {
		const held = heldById.get(tenantAtom.id);
		if (held?.tokenHash === tenantAtom.tokenHash) return;

		writeTenantAtom({ dataDir, tenantAtom });
		if (!held) {
			hold({ ...tenantAtom, slots: null });
			return;
		}
		// The same folder under a new token: the old one stops working at once.
		heldByTokenHash.delete(held.tokenHash);
		hold({ ...held, tokenHash: tenantAtom.tokenHash });
	}

	function hasAtom({ id }: { id: string }): boolean {
		return heldById.has(id);
	}

	function removeAtom({ id }: { id: string }): void {
		const held = heldById.get(id);
		if (held) {
			held.slots?.close();
			heldById.delete(id);
			heldByTokenHash.delete(held.tokenHash);
		}
		removeAtomFolder({ dataDir, id });
	}

	function close(): void {
		for (const held of heldById.values()) held.slots?.close();
		heldById.clear();
		heldByTokenHash.clear();
	}

	for (const tenantAtom of listTenantAtoms({ dataDir }))
		hold({ ...tenantAtom, slots: null });

	return { authorize, slotsFor, putAtom, hasAtom, removeAtom, close };
};
