import {
	type CustomizePlanLicense,
	type FrontendProduct,
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
import { usePendingLicenseLinks } from "./PendingLicenseLinksContext";
import {
	pooledSelectionChanged,
	useLicenseDraft,
	useLicenseDraftStore,
} from "./useLicenseDraftStore";
import { useLicenseSaveRegistry } from "./useLicenseSaveRegistry";

/**
 * Bridges a license card to its editor's save flow: seeds the license's draft
 * slot while mounted, and registers its dirty state plus ref-read callbacks.
 * On the plan page that's the save registry (set_plan_license on plan save);
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
	onSave: ({
		product,
		itemsChanged,
	}: {
		product: FrontendProduct;
		itemsChanged: boolean;
	}) => Promise<boolean>;
	buildCustomize: ({
		product,
		itemsChanged,
	}: {
		product: FrontendProduct;
		itemsChanged: boolean;
	}) => CustomizePlanLicense;
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
	const includedQuantity =
		draft?.includedQuantity ?? planLicense.included_quantity;
	const pooledFeatureIds =
		draft?.pooledFeatureIds ?? planLicense.pooled_feature_ids;
	const itemsChanged = useHasPlanChanges();
	const hasChanges =
		isPendingLink ||
		itemsChanged ||
		includedQuantity !== planLicense.included_quantity ||
		pooledSelectionChanged({
			draft: pooledFeatureIds,
			saved: planLicense.pooled_feature_ids,
		});

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
		seed(license.id, {
			includedQuantity: planLicense.included_quantity,
			pooledFeatureIds: planLicense.pooled_feature_ids,
		});
	};

	useEffect(() => {
		seed(license.id, {
			includedQuantity: planLicense.included_quantity,
			pooledFeatureIds: planLicense.pooled_feature_ids,
		});
		return () => clear(license.id);
	}, [
		license.id,
		planLicense.included_quantity,
		planLicense.pooled_feature_ids,
		seed,
		clear,
	]);

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
