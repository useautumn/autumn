import type { CustomizePlanLicense } from "@autumn/shared";
import { createContext, type ReactNode, useContext, useState } from "react";
import { create, useStore } from "zustand";

/**
 * Customize-mode collection target for license cards. On the plan page cards
 * persist via link; inside a customize editor (attach / update
 * subscription) this provider is mounted instead, and each card registers a
 * dirty flag plus a `get` that snapshots its CustomizePlanLicense. The editor's
 * save collects the dirty entries as the payload's `add_licenses` patch.
 */
interface LicenseCollectorEntry {
	dirty: boolean;
	get: () => CustomizePlanLicense;
}

interface LicenseCollectorState {
	entries: Record<string, LicenseCollectorEntry>;
	register: (licenseId: string, entry: LicenseCollectorEntry) => void;
	unregister: (licenseId: string) => void;
}

const createLicenseCollectorStore = () =>
	create<LicenseCollectorState>((set) => ({
		entries: {},
		register: (licenseId, entry) =>
			set((s) => ({ entries: { ...s.entries, [licenseId]: entry } })),
		unregister: (licenseId) =>
			set((s) => {
				const { [licenseId]: _, ...rest } = s.entries;
				return { entries: rest };
			}),
	}));

type LicenseCollectorStore = ReturnType<typeof createLicenseCollectorStore>;

const LicenseCollectorContext = createContext<LicenseCollectorStore | null>(
	null,
);

const fallbackStore = createLicenseCollectorStore();

export function LicenseCustomizeCollectorProvider({
	children,
}: {
	children: ReactNode;
}) {
	const [store] = useState(createLicenseCollectorStore);
	return (
		<LicenseCollectorContext.Provider value={store}>
			{children}
		</LicenseCollectorContext.Provider>
	);
}

/** Non-null only inside a customize-mode editor. */
export const useLicenseCollectorStore = () =>
	useContext(LicenseCollectorContext);

export const useHasCollectedLicenseChanges = () => {
	const store = useLicenseCollectorStore();
	return useStore(
		store ?? fallbackStore,
		(s) => store !== null && Object.values(s.entries).some((e) => e.dirty),
	);
};

/** Snapshot of the edited (dirty) license cards as add_licenses entries;
 * untouched cards are omitted so they keep inheriting the plan catalog. */
export const collectLicensePatchAdds = (
	store: LicenseCollectorStore,
): CustomizePlanLicense[] =>
	Object.values(store.getState().entries)
		.filter((entry) => entry.dirty)
		.map((entry) => entry.get());
