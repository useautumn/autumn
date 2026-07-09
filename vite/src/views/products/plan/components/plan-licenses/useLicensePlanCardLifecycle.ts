import {
	type CustomizePlanLicense,
	type PlanLicense,
	type ProductV2,
	sortPlanItems,
} from "@autumn/shared";
import { useEffect, useRef } from "react";
import {
	useHasPlanChanges,
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useLicenseCollectorStore } from "./LicenseCustomizeCollector";
import type { LicenseEditSnapshot } from "./licenseCustomizeUtils";
import { usePendingLicenseLinks } from "./PendingLicenseLinksContext";
import { useLicenseDraft, useLicenseDraftStore } from "./useLicenseDraftStore";
import { useLicenseSaveRegistry } from "./useLicenseSaveRegistry";

/**
 * Bridges a license card to its editor's save flow: seeds the license's draft
 * slot while mounted, and registers its dirty state plus ref-read callbacks.
 * On the plan page that's the save registry (link on plan save);
 * inside a customize editor it's the collector (snapshot into the attach/update
 * payload). A pending (staged, unsaved) link is always dirty — its save creates
 * the link, its discard drops the card.
 */
export const useLicensePlanCardLifecycle = ({
	planLicense,
	license,
	onSave,
	buildCustomize,
	isPendingLink,
}: {
	planLicense: PlanLicense;
	license: ProductV2;
	onSave: (snapshot: LicenseEditSnapshot) => Promise<boolean>;
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
	const { removePendingLink } = usePendingLicenseLinks();

	const draft = useLicenseDraft(license.id);
	const included = draft?.included ?? planLicense.included;
	const itemsChanged = useHasPlanChanges();
	const hasChanges =
		isPendingLink || itemsChanged || included !== planLicense.included;

	const editedProduct = () => ({
		...product,
		items: sortPlanItems({ items: product.items }),
	});

	const collectRef = useRef<() => CustomizePlanLicense>(() =>
		buildCustomize({ product: editedProduct(), itemsChanged }),
	);
	collectRef.current = () =>
		buildCustomize({ product: editedProduct(), itemsChanged });

	const saveRef = useRef<() => Promise<boolean>>(async () => true);
	saveRef.current = async () => {
		const success = await onSave({
			product: editedProduct(),
			itemsChanged,
		});
		if (success) {
			// Commit so the card stops reading as dirty; drafts fall back to the
			// refetched persisted values.
			itemDraft.commit();
			seed(license.id, {});
			// The refetched plan_licenses now include this link (mutateAsync
			// resolves after invalidation), so the staged entry can go.
			if (isPendingLink) removePendingLink(license.id);
		}
		return success;
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

	// Key the reseed on VALUES, not object identity — pending links rebuild
	// their planLicense every render and an identity-keyed reseed would wipe
	// in-progress edits (e.g. a typed included quantity).
	useEffect(() => {
		seed(license.id, { included: planLicense.included });
		return () => clear(license.id);
	}, [license.id, planLicense.included, seed, clear]);

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
			save: () => saveRef.current(),
			discard: () => discardRef.current(),
		});
		return () => unregister(license.id);
	}, [license.id, hasChanges, register, unregister, collectorStore]);
};
