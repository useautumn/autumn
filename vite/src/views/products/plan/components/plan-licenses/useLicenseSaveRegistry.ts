import type { PlanLicense, PlanLicenseParams } from "@autumn/shared";
import type { AxiosInstance } from "axios";
import { create } from "zustand";
import { runWithErrorToast } from "./runWithErrorToast";

/**
 * Registry of license cards on the plan page, keyed by license id.
 *
 * Each inline license editor lives in its own context, so the plan's single
 * SaveChangesBar can't reach their drafts directly. Instead every card
 * registers its entry builder here; the save bar composes ONE plans.update
 * carrying the full `licenses` array (entry per kept card, removed cards
 * omitted so the server unlinks them) and commits every card on success.
 */
interface LicenseSaveEntry {
	dirty: boolean;
	/** The card's licenses[] entry, or null when the card is staged for removal. */
	getEntry: () => PlanLicenseParams | null;
	/** Persist the card's item edits onto the license plan itself. */
	saveItems: () => Promise<boolean>;
	/** Reset the card's drafts after a successful save. */
	commit: () => void;
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

/** Compose the full licenses[] payload: every registered card's entry (removed
 * cards drop out), plus persisted links with no mounted card passed through
 * untouched. */
const composeLicensesPayload = ({
	persistedLinks,
}: {
	persistedLinks: PlanLicense[];
}): PlanLicenseParams[] => {
	const { entries } = useLicenseSaveRegistry.getState();
	const payload = Object.values(entries).flatMap((entry) => {
		const params = entry.getEntry();
		return params ? [params] : [];
	});

	const cardIds = new Set(Object.keys(entries));
	for (const link of persistedLinks) {
		if (cardIds.has(link.license_plan_id)) continue;
		payload.push({
			license_plan_id: link.license_plan_id,
			included: link.included,
			prepaid_only: link.prepaid_only,
		});
	}
	return payload;
};

/** Persist every card — item edits land on each license plan, link config in
 * one parent plans.update; true when everything succeeded. Reads the registry
 * imperatively so it can be called from the plan save handler. */
export const saveAllLicenses = async ({
	axiosInstance,
	parentPlanId,
	persistedLinks,
	onSuccess,
}: {
	axiosInstance: AxiosInstance;
	parentPlanId: string;
	persistedLinks: PlanLicense[];
	onSuccess?: () => Promise<unknown>;
}): Promise<boolean> => {
	const { entries } = useLicenseSaveRegistry.getState();
	if (!Object.values(entries).some((entry) => entry.dirty)) return true;

	const itemResults = await Promise.all(
		Object.values(entries)
			.filter((entry) => entry.dirty)
			.map((entry) => entry.saveItems().catch(() => false)),
	);
	if (!itemResults.every(Boolean)) return false;

	const licenses = composeLicensesPayload({ persistedLinks });
	const saved = await runWithErrorToast({
		action: () =>
			axiosInstance.post("/v1/plans.update", {
				plan_id: parentPlanId,
				licenses,
			}),
		fallbackMessage: "Failed to save licenses",
	});
	if (!saved) return false;

	for (const entry of Object.values(entries)) {
		entry.commit();
	}
	await onSuccess?.();
	return true;
};

export const discardAllLicenses = () => {
	const { entries } = useLicenseSaveRegistry.getState();
	for (const entry of Object.values(entries)) {
		entry.discard();
	}
};
