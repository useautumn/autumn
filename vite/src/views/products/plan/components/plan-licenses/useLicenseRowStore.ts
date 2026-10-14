import type { FrontendProduct } from "@autumn/shared";
import { create } from "zustand";

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
