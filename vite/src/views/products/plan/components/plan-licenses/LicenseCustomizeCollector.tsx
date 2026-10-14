import type { CustomizePlanLicense } from "@autumn/shared";
import { createContext, type ReactNode, useContext, useState } from "react";
import { create, useStore } from "zustand";

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

export const useLicenseCollectorStore = () =>
	useContext(LicenseCollectorContext)?.store ?? null;

export const useInitialLicensePatches = () =>
	useContext(LicenseCollectorContext)?.initialPatches ?? EMPTY_PATCHES;

export const useHasCollectedLicenseChanges = () => {
	const store = useLicenseCollectorStore();
	return useStore(
		store ?? fallbackStore,
		(s) => store !== null && Object.values(s.entries).some((e) => e.dirty),
	);
};

export const collectLicensePatchAdds = (
	store: LicenseCollectorStore,
): CustomizePlanLicense[] =>
	Object.values(store.getState().entries)
		.filter((entry) => entry.dirty)
		.map((entry) => entry.get());
