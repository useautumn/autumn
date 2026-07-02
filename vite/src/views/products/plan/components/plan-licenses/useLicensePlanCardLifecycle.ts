import {
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
import {
	pooledSelectionChanged,
	useLicenseDraft,
	useLicenseDraftStore,
} from "./useLicenseDraftStore";
import { useLicenseSaveRegistry } from "./useLicenseSaveRegistry";

/**
 * Bridges a license card to the plan-level save bar: seeds the license's draft
 * slot while mounted, and registers its dirty state plus ref-read save/discard
 * so saving the plan persists every dirty license in one go.
 */
export const useLicensePlanCardLifecycle = ({
	planLicense,
	license,
	onSave,
}: {
	planLicense: PlanLicense;
	license: ProductV2;
	onSave: (product: FrontendProduct) => Promise<boolean>;
}) => {
	const { product } = useProduct();
	const { itemDraft } = useSheet();
	const seed = useLicenseDraftStore((s) => s.seed);
	const clear = useLicenseDraftStore((s) => s.clear);
	const register = useLicenseSaveRegistry((s) => s.register);
	const unregister = useLicenseSaveRegistry((s) => s.unregister);

	const draft = useLicenseDraft(license.id);
	const includedQuantity =
		draft?.includedQuantity ?? planLicense.included_quantity;
	const pooledFeatureIds =
		draft?.pooledFeatureIds ?? planLicense.pooled_feature_ids;
	const hasChanges =
		useHasPlanChanges() ||
		includedQuantity !== planLicense.included_quantity ||
		pooledSelectionChanged({
			draft: pooledFeatureIds,
			saved: planLicense.pooled_feature_ids,
		});

	const saveRef = useRef<() => Promise<boolean>>(async () => true);
	saveRef.current = async () => {
		const success = await onSave({
			...product,
			items: sortPlanItems({ items: product.items }),
		});
		if (success) {
			// Commit so the card stops reading as dirty; drafts fall back to the
			// refetched persisted values.
			itemDraft.commit();
			seed(license.id, {});
		}
		return success;
	};

	const discardRef = useRef<() => void>(() => {});
	discardRef.current = () => {
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
		register(license.id, {
			dirty: hasChanges,
			save: () => saveRef.current(),
			discard: () => discardRef.current(),
		});
		return () => unregister(license.id);
	}, [license.id, hasChanges, register, unregister]);
};
