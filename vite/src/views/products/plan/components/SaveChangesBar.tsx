import { isFeaturePriceItem, productV2ToBasePrice } from "@autumn/shared";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import {
	useHasChanges,
	useIsCusPlanEditor,
	useProductStore,
	useWillVersion,
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
	const willVersion = useWillVersion();

	const [saving, setSaving] = useState(false);

	const { refetch } = useProductsQuery();
	const { counts, isLoading } = useProductCountsQuery();
	const { refetch: queryRefetch } = useProductQuery();

	// const { }

	const basePrice = productV2ToBasePrice({ product });

	const isCusPlanEditor = useIsCusPlanEditor();
	const saveButtonText = isCusPlanEditor ? "Save and Return" : "Save";

	useProductChangedAlert({
		hasChanges,
		disabled: isOnboarding, // Disable navigation blocking in onboarding mode
	});

	const handleSaveClicked = async () => {
		if (
			product.planType === "paid" &&
			product.basePriceType !== "usage" &&
			!basePrice?.price
		) {
			toast.error("Please add a plan price greater than 0, or remove it.");
			setSaving(false);
			return;
		}

		if (!isOnboarding && isLoading) {
			toast.error("Plan counts are loading");
			return;
		}

		// If changes require versioning and we can't confirm there are 0 customers, show dialog
		// This errs on the side of caution when counts data is unavailable
		if (!isOnboarding && willVersion && (!counts || counts.all !== 0)) {
			setShowNewVersionDialog(true);
			return;
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
			onSuccess: async () => {
				if (isOnboarding) {
					await refetch();
				} else {
					await queryRefetch();
				}
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
			<Button variant="secondary" onClick={handleDiscardClicked}>
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
