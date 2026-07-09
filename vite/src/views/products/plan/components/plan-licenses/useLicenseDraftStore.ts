import { create } from "zustand";

/**
 * Draft plan-license fields (included quantity) edited in the
 * license's sheets. They live on the plan-license row, not the license product,
 * so they're kept out of the item draft and saved with the plan. A key in
 * `drafts` means the license is being edited inside a plan (vs its own page).
 */
export interface LicenseDraft {
	included?: number;
}

interface LicenseDraftState {
	drafts: Record<string, LicenseDraft>;
	seed: (licenseId: string, draft: LicenseDraft) => void;
	patch: (licenseId: string, patch: Partial<LicenseDraft>) => void;
	clear: (licenseId: string) => void;
}

export const useLicenseDraftStore = create<LicenseDraftState>((set) => ({
	drafts: {},
	seed: (licenseId, draft) =>
		set((s) => ({ drafts: { ...s.drafts, [licenseId]: draft } })),
	patch: (licenseId, patch) =>
		set((s) => ({
			drafts: {
				...s.drafts,
				[licenseId]: { ...s.drafts[licenseId], ...patch },
			},
		})),
	clear: (licenseId) =>
		set((s) => {
			const { [licenseId]: _, ...rest } = s.drafts;
			return { drafts: rest };
		}),
}));

export const useLicenseDraft = (licenseId: string) =>
	useLicenseDraftStore((s) => s.drafts[licenseId]);

export const useIsLicenseDraftSeeded = (licenseId: string) =>
	useLicenseDraftStore((s) => licenseId in s.drafts);
