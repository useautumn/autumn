import { isFeaturePriceItem } from "@autumn/shared";
import { Button, ShortcutButton } from "@autumn/ui";
import { useState } from "react";
import { toast } from "sonner";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import {
	useHasChanges,
	useIsCusPlanEditor,
	useProductStore,
} from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useProductCountsQuery } from "../../product/hooks/queries/useProductCountsQuery";
import { useProductQuery } from "../../product/hooks/useProductQuery";
import { useProductContext } from "../../product/ProductContext";
import { updateProduct } from "../../product/utils/updateProduct";
import { useProductChangedAlert } from "../hooks/useProductChangedAlert";
import { PlanEditorBar } from "./PlanEditorBar";

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
	const setProduct = useProductStore((s) => s.setProduct);
	const { type: sheetType } = useSheetStore();
	const hasChanges = useHasChanges();

	const [saving, setSaving] = useState(false);

	const { invalidate: invalidateProducts } = useProductsQuery();
	const { refetch: queryRefetch, invalidate: invalidateProduct } =
		useProductQuery();
	const { counts, isLoading: isCountsLoading } = useProductCountsQuery(
		product.version ? { version: product.version } : {},
	);

	const isCusPlanEditor = useIsCusPlanEditor();
	const saveButtonText = isCusPlanEditor ? "Save and Return" : "Save";

	useProductChangedAlert({
		hasChanges,
		disabled: isOnboarding, // Disable navigation blocking in onboarding mode
	});

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

		if (!isOnboarding) {
			if (isCountsLoading) {
				toast.error("Plan counts are loading");
				return;
			}
			if ((counts?.all ?? 0) > 0) {
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
		const result = await updateProduct({
			axiosInstance,
			productId: product.id,
			product,
			version: product.version,
			onSuccess: async () => {
				await queryRefetch();
				await Promise.all([invalidateProduct(), invalidateProducts()]);
			},
		});

		// Only show success toast if update was successful
		if (result) {
			toast.success("Changes saved successfully");
		}

		setSaving(false);
	};

	const handleDiscardClicked = () => {
		const baseProduct = useProductStore.getState().baseProduct;
		if (baseProduct) {
			setProduct(baseProduct);
		}
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
