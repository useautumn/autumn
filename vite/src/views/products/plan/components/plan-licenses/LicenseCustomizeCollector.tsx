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

interface LicenseCollectorContextValue {
	store: LicenseCollectorStore;
	initialPatches: Record<string, CustomizePlanLicense>;
}

const LicenseCollectorContext =
	createContext<LicenseCollectorContextValue | null>(null);

const fallbackStore = createLicenseCollectorStore();
const EMPTY_PATCHES: Record<string, CustomizePlanLicense> = {};

export function LicenseCustomizeCollectorProvider({
	children,
	initialPatches,
}: {
	children: ReactNode;
	/** Previously saved add_licenses patch — re-seeds cards so edits survive
	 * closing and reopening the editor. */
	initialPatches?: CustomizePlanLicense[] | null;
}) {
	const [value] = useState<LicenseCollectorContextValue>(() => ({
		store: createLicenseCollectorStore(),
		initialPatches: Object.fromEntries(
			(initialPatches ?? []).map((patch) => [patch.license_plan_id, patch]),
		),
	}));
	return (
		<LicenseCollectorContext.Provider value={value}>
			{children}
		</LicenseCollectorContext.Provider>
	);
}

/** Non-null only inside a customize-mode editor. */
export const useLicenseCollectorStore = () =>
	useContext(LicenseCollectorContext)?.store ?? null;

/** Saved add_licenses entries keyed by license plan id; empty outside a
 * customize editor. */
export const useInitialLicensePatches = () =>
	useContext(LicenseCollectorContext)?.initialPatches ?? EMPTY_PATCHES;

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
