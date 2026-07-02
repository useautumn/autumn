import { isFeaturePriceItem } from "@autumn/shared";
import { Button, ShortcutButton } from "@autumn/ui";
import { useState } from "react";
import { toast } from "sonner";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { usePrefetchPlanUpdatePreview } from "@/hooks/queries/usePlanUpdatePreview";
import { usePlanVariants } from "@/hooks/queries/usePlanVariants";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import {
	useHasChanges,
	useIsCusPlanEditor,
	useIsMetadataOnlyChange,
	useProductStore,
} from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useProductCountsQuery } from "../../product/hooks/queries/useProductCountsQuery";
import { useProductQuery } from "../../product/hooks/useProductQuery";
import { useProductContext } from "../../product/ProductContext";
import { updateProduct } from "../../product/utils/updateProduct";
import { buildPreviewUpdatePlanParams } from "../versioning/buildMigrationDraft";
import { PlanEditorBar } from "./PlanEditorBar";
import {
	discardAllLicenses,
	saveAllLicenses,
	useHasLicenseChanges,
} from "./plan-licenses/useLicenseSaveRegistry";

interface SaveChangesBarProps {
	isOnboarding?: boolean;
}

export const SaveChangesBar = ({
	isOnboarding = false,
}: SaveChangesBarProps) => {
	const axiosInstance = useAxiosInstance();
	const { setShowNewVersionDialog } = useProductContext();

	// Get product state from store
	const product = useProductStore((s) => s.product);
	const baseProduct = useProductStore((s) => s.baseProduct);
	const setProduct = useProductStore((s) => s.setProduct);
	const { type: sheetType } = useSheetStore();
	const planHasChanges = useHasChanges();
	const licenseHasChanges = useHasLicenseChanges();
	const hasChanges = planHasChanges || licenseHasChanges;
	const { features = [] } = useFeaturesQuery();
	const prefetchPlanUpdatePreview = usePrefetchPlanUpdatePreview();

	const [saving, setSaving] = useState(false);

	const { invalidate: invalidateProducts } = useProductsQuery();
	const {
		refetch: queryRefetch,
		invalidate: invalidateProduct,
		versionCounts,
	} = useProductQuery();
	const { counts, isLoading: isCountsLoading } = useProductCountsQuery(
		product.version ? { version: product.version } : {},
	);

	const isCusPlanEditor = useIsCusPlanEditor();
	const isMetadataOnlyChange = useIsMetadataOnlyChange();
	const saveButtonText = isCusPlanEditor ? "Save and Return" : "Save";

	const { data: variants = [] } = usePlanVariants(
		product.id,
		hasChanges && !isOnboarding,
	);

	const handleSaveClicked = async () => {
		// if (
		// 	product.planType === "paid" &&
		// 	product.basePriceType !== "usage" &&
		// 	!basePrice?.price
		// ) {
		// 	toast.error("Please add a plan price greater than 0, or remove it.");
		// 	setSaving(false);
		// 	return;
		// }

		if (!isOnboarding && planHasChanges) {
			if (isCountsLoading) {
				toast.error("Plan counts are loading");
				return;
			}
			// Customers on any version (not just the one being edited) mean the
			// change could affect grandfathered users, so surface the versioning
			// dialog with its "update existing/all versions" options.
			const hasCustomersOnAnyVersion =
				(counts?.all ?? 0) > 0 ||
				Object.values(versionCounts).some((vc) => (vc.active ?? 0) > 0);
			const hasCustomers = hasCustomersOnAnyVersion && !isMetadataOnlyChange;
			if (hasCustomers || variants.length > 0) {
				// Warm the preview so the dialog opens with data already present.
				setSaving(true);
				try {
					await prefetchPlanUpdatePreview({
						planId: product.id,
						params: buildPreviewUpdatePlanParams({
							baseProduct,
							editedProduct: product,
							features,
						}),
					});
				} finally {
					setSaving(false);
				}
				setShowNewVersionDialog(true);
				return;
			}
		}

		setSaving(true);

		// If the plan type is free and user is adding a priced feature, set plan to usage-based
		if (product.planType === "free" && product.items.some(isFeaturePriceItem)) {
			setProduct({
				...product,
				planType: "paid",
				basePriceType: "usage",
			});
		}

		// Save the plan (when changed) and every dirty license together, so one
		// action persists everything on the page.
		const [planSaved, licensesSaved] = await Promise.all([
			planHasChanges
				? updateProduct({
						axiosInstance,
						productId: product.id,
						product,
						version: product.version,
						onSuccess: async () => {
							await queryRefetch();
							await Promise.all([invalidateProduct(), invalidateProducts()]);
						},
					})
				: Promise.resolve(true),
			saveAllLicenses(),
		]);

		// License failures already toast their own error, so only the combined
		// success gets a toast here.
		if (planSaved && licensesSaved) {
			toast.success("Changes saved successfully");
		}

		setSaving(false);
	};

	const handleDiscardClicked = () => {
		const baseProduct = useProductStore.getState().baseProduct;
		if (baseProduct) {
			setProduct(baseProduct);
		}
		discardAllLicenses();
		// If we're editing or creating a feature, go back to edit-plan
		// if (sheetType === "edit-feature" || sheetType === "new-feature") {
		// 	setSheet({ type: "edit-plan", itemId: null });
		// }
	};

	if (!hasChanges) return null;
	//hide if sheet is open
	if (sheetType && !isOnboarding) return null;

	return (
		<PlanEditorBar>
			<p className="text-body whitespace-nowrap truncate">
				You have unsaved changes
			</p>
			<Button
				variant="secondary"
				onClick={handleDiscardClicked}
				disabled={saving}
			>
				Discard
			</Button>
			<ShortcutButton
				metaShortcut="s"
				onClick={handleSaveClicked}
				isLoading={saving}
			>
				{saveButtonText}
			</ShortcutButton>
		</PlanEditorBar>
	);
};
