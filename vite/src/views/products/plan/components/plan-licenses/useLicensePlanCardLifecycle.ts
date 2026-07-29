import {
	type CustomizePlanLicense,
	type PlanLicense,
	type PlanLicenseParams,
	type ProductV2,
	sortPlanItems,
} from "@autumn/shared";
import { useEffect, useRef } from "react";
import {
	useHasPlanChanges,
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import {
	useInitialLicensePatches,
	useLicenseCollectorStore,
} from "./LicenseCustomizeCollector";
import type { LicenseEditSnapshot } from "./licenseCustomizeUtils";
import { usePendingLicenseLinks } from "./PendingLicenseLinksContext";
import { useLicenseDraft, useLicenseDraftStore } from "./useLicenseDraftStore";
import { useLicenseSaveRegistry } from "./useLicenseSaveRegistry";

/** Registers a card with the parent save registry or customer patch collector. */
export const useLicensePlanCardLifecycle = ({
	planLicense,
	license,
	buildEntry,
	buildCustomize,
	isPendingLink,
}: {
	planLicense: PlanLicense;
	license: ProductV2;
	buildEntry: (snapshot: LicenseEditSnapshot) => PlanLicenseParams;
	buildCustomize: (snapshot: LicenseEditSnapshot) => CustomizePlanLicense;
	isPendingLink: boolean;
}) => {
	const { product } = useProduct();
	const { itemDraft } = useSheet();
	const seed = useLicenseDraftStore((s) => s.seed);
	const clear = useLicenseDraftStore((s) => s.clear);
	const register = useLicenseSaveRegistry((s) => s.register);
	const unregister = useLicenseSaveRegistry((s) => s.unregister);
	const collectorStore = useLicenseCollectorStore();
	const initialPatch = useInitialLicensePatches()[license.id];
	const { removePendingLink } = usePendingLicenseLinks();

	const draft = useLicenseDraft(license.id);
	const seededIncluded = initialPatch?.included ?? planLicense.included;
	const included = draft?.included ?? seededIncluded;
	const removed = draft?.removed ?? false;
	const itemsChanged = useHasPlanChanges();
	// A card seeded from a saved patch stays dirty so re-saving re-collects it
	// instead of silently dropping the earlier customization.
	const hasChanges =
		isPendingLink ||
		removed ||
		itemsChanged ||
		Boolean(initialPatch) ||
		included !== planLicense.included;

	const editedProduct = () => ({
		...product,
		items: sortPlanItems({ items: product.items }),
	});

	const collectRef = useRef<() => CustomizePlanLicense>(() =>
		buildCustomize({ product: editedProduct(), itemsChanged }),
	);
	collectRef.current = () =>
		buildCustomize({ product: editedProduct(), itemsChanged });

	const entryRef = useRef<() => PlanLicenseParams | null>(() => null);
	entryRef.current = () => {
		if (useLicenseDraftStore.getState().drafts[license.id]?.removed) {
			return null;
		}
		return buildEntry({ product: editedProduct(), itemsChanged });
	};

	const commitRef = useRef<() => void>(() => {});
	commitRef.current = () => {
		// Reset so the card stops reading as dirty; drafts fall back to the
		// refetched persisted values.
		itemDraft.commit();
		seed(license.id, {});
		// The refetched plan_licenses now include this link, so the staged
		// entry can go.
		if (isPendingLink) removePendingLink(license.id);
	};

	const discardRef = useRef<() => void>(() => {});
	discardRef.current = () => {
		if (isPendingLink) {
			removePendingLink(license.id);
			return;
		}
		itemDraft.discard();
		seed(license.id, { included: planLicense.included });
	};

	// Pending links rebuild their object every render; seed from stable values.
	useEffect(() => {
		seed(license.id, { included: seededIncluded });
		return () => clear(license.id);
	}, [license.id, seededIncluded, seed, clear]);

	useEffect(() => {
		if (collectorStore) {
			const collector = collectorStore.getState();
			collector.register(license.id, {
				dirty: hasChanges,
				get: () => collectRef.current(),
			});
			return () => collectorStore.getState().unregister(license.id);
		}

		register(license.id, {
			dirty: hasChanges,
			getEntry: () => entryRef.current(),
			commit: () => commitRef.current(),
			discard: () => discardRef.current(),
		});
		return () => unregister(license.id);
	}, [
		license.id,
		license.name,
		hasChanges,
		itemsChanged,
		removed,
		register,
		unregister,
		collectorStore,
	]);
};
