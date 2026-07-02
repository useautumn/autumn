import { create } from "zustand";

/**
 * Draft "included quantity" per plan-license, edited in the license's Plan
 * Settings sheet. Kept out of the license's item draft because it lives on the
 * plan-license row, not the license product. The value is saved with the plan
 * (see useLicenseCustomize + the save registry); `dirty` is the draft differing
 * from the persisted value.
 */
interface LicenseQuantityState {
	drafts: Record<string, number | undefined>;
	set: (licenseId: string, quantity: number | undefined) => void;
	clear: (licenseId: string) => void;
}

export const useLicenseQuantityStore = create<LicenseQuantityState>((set) => ({
	drafts: {},
	set: (licenseId, quantity) =>
		set((s) => ({ drafts: { ...s.drafts, [licenseId]: quantity } })),
	clear: (licenseId) =>
		set((s) => {
			const { [licenseId]: _, ...rest } = s.drafts;
			return { drafts: rest };
		}),
}));

/** The effective included quantity for a license: its draft if edited, else the
 * persisted value. */
export const useLicenseQuantity = (licenseId: string, saved: number) =>
	useLicenseQuantityStore((s) => s.drafts[licenseId] ?? saved);

/** Whether the license card seeded a draft slot, i.e. the license is being
 * edited inside a plan (vs on its own product page). */
export const useIsLicenseQuantitySeeded = (licenseId: string) =>
	useLicenseQuantityStore((s) => licenseId in s.drafts);
