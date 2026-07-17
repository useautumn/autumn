import type { PlanLicense, PlanLicenseParams } from "@autumn/shared";
import type { AxiosInstance } from "axios";
import { create } from "zustand";
import { runWithErrorToast } from "./runWithErrorToast";

/** Collects isolated card drafts into one parent `plans.update`. */
interface LicenseSaveEntry {
	dirty: boolean;
	/** The card's licenses[] entry, or null when the card is staged for removal. */
	getEntry: () => PlanLicenseParams | null;
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

/** Includes mounted cards and passes unmounted persisted links through. */
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

export const getLicenseUpdatePayload = ({
	persistedLinks,
}: {
	persistedLinks: PlanLicense[];
}): PlanLicenseParams[] | undefined => {
	const { entries } = useLicenseSaveRegistry.getState();
	if (!Object.values(entries).some((entry) => entry.dirty)) return undefined;
	return composeLicensesPayload({ persistedLinks });
};

export const commitLicenseChanges = () => {
	const { entries } = useLicenseSaveRegistry.getState();
	for (const entry of Object.values(entries)) entry.commit();
};

/** Persists all dirty card state through one parent `plans.update`. */
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
	const licenses = getLicenseUpdatePayload({ persistedLinks });
	if (!licenses) return true;
	const saved = await runWithErrorToast({
		action: () =>
			axiosInstance.post("/v1/plans.update", {
				plan_id: parentPlanId,
				licenses,
			}),
		fallbackMessage: "Failed to save licenses",
	});
	if (!saved) return false;

	commitLicenseChanges();
	await onSuccess?.();
	return true;
};

export const discardAllLicenses = () => {
	const { entries } = useLicenseSaveRegistry.getState();
	for (const entry of Object.values(entries)) {
		entry.discard();
	}
};
