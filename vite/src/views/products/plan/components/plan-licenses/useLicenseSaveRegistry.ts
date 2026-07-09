import { create } from "zustand";

/**
 * Registry of pending license customize saves, keyed by license id.
 *
 * Each inline license editor lives in its own context, so the plan's single
 * SaveChangesBar can't reach their drafts directly. Instead every dirty license
 * registers its `save` (flush its draft → link) here; the plan save
 * bar reads `useHasLicenseChanges()` to include them in its dirty state and calls
 * `saveAll()` to persist them together — one save for the whole plan.
 */
interface LicenseSaveEntry {
	dirty: boolean;
	save: () => Promise<boolean>;
	discard: () => void;
}

interface LicenseSaveRegistryState {
	entries: Record<string, LicenseSaveEntry>;
	register: (id: string, entry: LicenseSaveEntry) => void;
	unregister: (id: string) => void;
}

export const useLicenseSaveRegistry = create<LicenseSaveRegistryState>(
	(set) => ({
		entries: {},
		register: (id, entry) =>
			set((s) => ({ entries: { ...s.entries, [id]: entry } })),
		unregister: (id) =>
			set((s) => {
				const { [id]: _, ...rest } = s.entries;
				return { entries: rest };
			}),
	}),
);

export const useHasLicenseChanges = () =>
	useLicenseSaveRegistry((s) =>
		Object.values(s.entries).some((entry) => entry.dirty),
	);

/** Save every dirty license; true only when all of them succeeded. Reads the
 * store imperatively so it can be called from the plan save handler. */
export const saveAllLicenses = async (): Promise<boolean> => {
	const { entries } = useLicenseSaveRegistry.getState();
	const results = await Promise.all(
		Object.values(entries)
			.filter((entry) => entry.dirty)
			.map((entry) => entry.save().catch(() => false)),
	);
	return results.every(Boolean);
};

export const discardAllLicenses = () => {
	const { entries } = useLicenseSaveRegistry.getState();
	for (const entry of Object.values(entries)) {
		entry.discard();
	}
};
