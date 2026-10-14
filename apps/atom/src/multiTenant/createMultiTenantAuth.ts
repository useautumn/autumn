import { statSync } from "node:fs";
import { join } from "node:path";
import { hashToken } from "../auth/hashToken.js";
import type { Auth } from "../auth/types/auth.js";
import { CATALOG_FILE, openSlots } from "../slots/openSlots.js";
import type { Slots } from "../slots/types/slots.js";
import type { HeldSubjects } from "../state/heldSubjects/types/heldSubjects.js";
import type { SubjectPulls } from "../subjectPulls/types/subjectPulls.js";
import type { SlotOwners } from "../threads/owners/types/slotOwners.js";
import {
	atomFolderPath,
	hasAtomFile,
	listTenantAtoms,
	removeAtomFolder,
	type TenantAtom,
	writeTenantAtom,
} from "./atomFolders.js";

export const TENANTS_REVALIDATE_MS = 1000;
export const TENANTS_MISS_RESCAN_MS = 100;

export type MultiTenantAuth = Auth & {
	putAtom(params: TenantAtom): void;
	hasAtom(params: { id: string }): boolean;
	listAtoms(): TenantAtom[];
	removeAtom(params: { id: string }): void;
};

type HeldAtom = TenantAtom & {
	slots: Slots | null;
	catalogInode: number | null;
};

export const createMultiTenantAuth = ({
	dataDir,
	slotCount,
	owners,
	heldSubjects,
	subjectPulls,
	now,
	clock = () => performance.now(),
}: {
	dataDir: string;
	slotCount: number;
	owners: SlotOwners;
	heldSubjects: HeldSubjects;
	subjectPulls: SubjectPulls;
	now?: () => number;
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

	function catalogInodeOf({ id }: { id: string }): number | null {
		try {
			return statSync(join(atomFolderPath({ dataDir, id }), CATALOG_FILE)).ino;
		} catch {
			return null;
		}
	}

	function forget(held: HeldAtom): void {
		heldById.delete(held.id);
		heldByTokenHash.delete(held.tokenHash);
		held.slots?.close();
	}

	function rescan(): void {
		const onDisk = new Map(
			listTenantAtoms({ dataDir }).map((tenantAtom) => [
				tenantAtom.id,
				tenantAtom,
			]),
		);
		for (const held of [...heldById.values()]) {
			const tokenHash = onDisk.get(held.id)?.tokenHash;
			const replaced =
				held.slots !== null &&
				catalogInodeOf({ id: held.id }) !== held.catalogInode;
			if (tokenHash === undefined || replaced) forget(held);
			else if (tokenHash !== held.tokenHash) retoken({ held, tokenHash });
		}
		for (const tenantAtom of onDisk.values())
			if (!heldById.has(tenantAtom.id))
				hold({ ...tenantAtom, slots: null, catalogInode: null });
		scannedAt = clock();
	}

	function isRescanDue({ tokenHash }: { tokenHash: string }): boolean {
		const sinceScan = clock() - scannedAt;
		if (sinceScan >= TENANTS_REVALIDATE_MS) return true;
		const isUnknown = !heldByTokenHash.has(tokenHash);
		return isUnknown && sinceScan >= TENANTS_MISS_RESCAN_MS;
	}

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
			now,
			pulls: {
				subjectPulls,
				tokenHash: () => held.tokenHash,
			},
		});
		held.catalogInode = catalogInodeOf({ id: held.id });
		return held.slots;
	}

	function authorize({ token }: { token: string }): Slots | null {
		const tokenHash = hashToken({ token });
		if (isRescanDue({ tokenHash })) rescan();
		const held = heldByTokenHash.get(tokenHash);
		return held ? slotsOf(held) : null;
	}

	function slotsFor({ atomId }: { atomId: string | null }): Slots | null {
		if (atomId === null) return null;
		if (!heldById.has(atomId) || clock() - scannedAt >= TENANTS_REVALIDATE_MS)
			rescan();
		const held = heldById.get(atomId);
		return held ? slotsOf(held) : null;
	}

	function putAtom(tenantAtom: TenantAtom): void {
		writeTenantAtom({ dataDir, tenantAtom });
		const held = heldById.get(tenantAtom.id);
		if (!held) {
			hold({ ...tenantAtom, slots: null, catalogInode: null });
			return;
		}
		if (held.tokenHash !== tenantAtom.tokenHash)
			retoken({ held, tokenHash: tenantAtom.tokenHash });
	}

	function hasAtom({ id }: { id: string }): boolean {
		return hasAtomFile({ dataDir, id });
	}

	function listAtoms(): TenantAtom[] {
		if (clock() - scannedAt >= TENANTS_REVALIDATE_MS) rescan();
		return [...heldById.values()].map(({ id, tokenHash }) => ({
			id,
			tokenHash,
		}));
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

	return {
		authorize,
		slotsFor,
		putAtom,
		hasAtom,
		listAtoms,
		removeAtom,
		close,
	};
};
