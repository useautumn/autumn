import { create } from "zustand";

/**
 * Whether an inline license editor currently has a feature sheet open.
 *
 * License editors keep their own (local) sheet state so they never collide with
 * the page's own sheet. But the page-level PlanEditor still needs to shift its
 * content when a license sheet opens — and it can't read a descendant's state.
 * So the license editor reports open/close here synchronously from its sheet
 * handlers (no effect), and PlanEditor reads it. Ref-counted so multiple license
 * cards can't clobber each other.
 */
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
