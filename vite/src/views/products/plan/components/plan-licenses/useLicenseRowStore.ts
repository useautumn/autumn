import type { FrontendProduct } from "@autumn/shared";
import { create } from "zustand";

/**
 * Bridges each mounted license card's local editor to the license row rendered
 * in the parent plan's feature list: cards publish their live product (so the
 * row's price tracks unsaved edits, which live in the card's own context), and
 * a row asks its card to open the price sheet since that state is card-local.
 */
interface LicenseRowSummary {
	product: FrontendProduct;
	isEditingPrice: boolean;
}

interface LicenseRowState {
	summaries: Record<string, LicenseRowSummary>;
	openRequests: Record<string, true>;
	publish: (licenseId: string, summary: LicenseRowSummary) => void;
	clear: (licenseId: string) => void;
	requestOpen: (licenseId: string) => void;
	consumeOpen: (licenseId: string) => void;
}

export const useLicenseRowStore = create<LicenseRowState>((set) => ({
	summaries: {},
	openRequests: {},
	publish: (licenseId, summary) =>
		set((s) => ({ summaries: { ...s.summaries, [licenseId]: summary } })),
	clear: (licenseId) =>
		set((s) => {
			const { [licenseId]: _, ...rest } = s.summaries;
			return { summaries: rest };
		}),
	requestOpen: (licenseId) =>
		set((s) => ({ openRequests: { ...s.openRequests, [licenseId]: true } })),
	consumeOpen: (licenseId) =>
		set((s) => {
			const { [licenseId]: _, ...rest } = s.openRequests;
			return { openRequests: rest };
		}),
}));

export const useLicenseRowSummary = (licenseId: string) =>
	useLicenseRowStore((s) => s.summaries[licenseId]);
