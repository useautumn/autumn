import { hashToken } from "../auth/hashToken.js";
import type { Auth } from "../auth/types/auth.js";
import { openSlots } from "../slots/openSlots.js";
import type { Slots } from "../slots/types/slots.js";
import type { HeldSubjects } from "../state/heldSubjects/types/heldSubjects.js";
import type { SlotOwners } from "../threads/owners/types/slotOwners.js";
import {
	atomFolderPath,
	hasAtomFile,
	listTenantAtoms,
	removeAtomFolder,
	type TenantAtom,
	writeTenantAtom,
} from "./atomFolders.js";

/** A put, rotate or delete made through another thread reaches this one by its first request this long after. */
export const TENANTS_REVALIDATE_MS = 1000;
/** An unknown token re-reads the folders at most this often, so a flood of bad tokens cannot rescan per request. */
export const TENANTS_MISS_RESCAN_MS = 100;

/** One Atom holding many orgs: each gets a token and a folder of its own, shared by every thread. */
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
	owners,
	heldSubjects,
	clock = () => performance.now(),
}: {
	dataDir: string;
	slotCount: number;
	owners: SlotOwners;
	heldSubjects: HeldSubjects;
	clock?: () => number;
}): MultiTenantAuth => {
	const heldById = new Map<string, HeldAtom>();
	const heldByTokenHash = new Map<string, HeldAtom>();
	let scannedAt = Number.NEGATIVE_INFINITY;

	function hold(held: HeldAtom): void {
		heldById.set(held.id, held);
		heldByTokenHash.set(held.tokenHash, held);
	}

	function retoken({
		held,
		tokenHash,
	}: {
		held: HeldAtom;
		tokenHash: string;
	}): void {
		heldByTokenHash.delete(held.tokenHash);
		held.tokenHash = tokenHash;
		heldByTokenHash.set(tokenHash, held);
	}

	function forget(held: HeldAtom): void {
		heldById.delete(held.id);
		heldByTokenHash.delete(held.tokenHash);
		held.slots?.close();
	}

	/** The folders are the truth every thread shares; synchronous, so one thread never runs two at once. */
	function rescan(): void {
		const onDisk = new Map(
			listTenantAtoms({ dataDir }).map((tenantAtom) => [
				tenantAtom.id,
				tenantAtom,
			]),
		);
		for (const held of [...heldById.values()]) {
			const tokenHash = onDisk.get(held.id)?.tokenHash;
			if (tokenHash === undefined) forget(held);
			else if (tokenHash !== held.tokenHash) retoken({ held, tokenHash });
		}
		for (const tenantAtom of onDisk.values())
			if (!heldById.has(tenantAtom.id)) hold({ ...tenantAtom, slots: null });
		scannedAt = clock();
	}

	function isRescanDue({ tokenHash }: { tokenHash: string }): boolean {
		const sinceScan = clock() - scannedAt;
		if (sinceScan >= TENANTS_REVALIDATE_MS) return true;
		const isUnknown = !heldByTokenHash.has(tokenHash);
		return isUnknown && sinceScan >= TENANTS_MISS_RESCAN_MS;
	}

	/** Null when another thread deleted the Atom since the last rescan: opening would recreate its folder. */
	function slotsOf(held: HeldAtom): Slots | null {
		if (held.slots) return held.slots;
		if (!hasAtomFile({ dataDir, id: held.id })) {
			forget(held);
			return null;
		}
		held.slots = openSlots({
			folder: atomFolderPath({ dataDir, id: held.id }),
			slotCount,
			atomId: held.id,
			owners,
			held: heldSubjects,
		});
		return held.slots;
	}

	/** One map lookup by the token's hash, after a rescan when one is due: no other org is read or touched. */
	function authorize({ token }: { token: string }): Slots | null {
		const tokenHash = hashToken({ token });
		if (isRescanDue({ tokenHash })) rescan();
		const held = heldByTokenHash.get(tokenHash);
		return held ? slotsOf(held) : null;
	}

	/** A push or another thread's call names its folder; a rescan picks up an Atom registered since. */
	function slotsFor({ atomId }: { atomId: string | null }): Slots | null {
		if (atomId === null) return null;
		if (!heldById.has(atomId) || clock() - scannedAt >= TENANTS_REVALIDATE_MS)
			rescan();
		const held = heldById.get(atomId);
		return held ? slotsOf(held) : null;
	}

	/** Always written: what this thread holds may be stale, and the file is what every other thread reads. */
	function putAtom(tenantAtom: TenantAtom): void {
		writeTenantAtom({ dataDir, tenantAtom });
		const held = heldById.get(tenantAtom.id);
		if (!held) {
			hold({ ...tenantAtom, slots: null });
			return;
		}
		if (held.tokenHash !== tenantAtom.tokenHash)
			retoken({ held, tokenHash: tenantAtom.tokenHash });
	}

	function hasAtom({ id }: { id: string }): boolean {
		return hasAtomFile({ dataDir, id });
	}

	function removeAtom({ id }: { id: string }): void {
		const held = heldById.get(id);
		if (held) forget(held);
		removeAtomFolder({ dataDir, id });
	}

	function close(): void {
		for (const held of heldById.values()) held.slots?.close();
		heldById.clear();
		heldByTokenHash.clear();
	}

	rescan();

	return { authorize, slotsFor, putAtom, hasAtom, removeAtom, close };
};
