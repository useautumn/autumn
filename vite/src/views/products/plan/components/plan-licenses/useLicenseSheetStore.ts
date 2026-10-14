import { create } from "zustand";

interface LicenseSheetState {
	openCount: number;
	reportOpen: () => void;
	reportClosed: () => void;
}

export const useLicenseSheetStore = create<LicenseSheetState>((set) => ({
	openCount: 0,
	reportOpen: () => set((s) => ({ openCount: s.openCount + 1 })),
	reportClosed: () => set((s) => ({ openCount: Math.max(0, s.openCount - 1) })),
}));

export const useIsLicenseSheetOpen = () =>
	useLicenseSheetStore((s) => s.openCount > 0);
