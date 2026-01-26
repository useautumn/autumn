import {
	CreateFeatureSchema,
	FeatureUsageType,
	featureV1ToDbFeature,
} from "@autumn/shared";
import type { AxiosError } from "axios";
import { useState } from "react";
import { toast } from "sonner";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import {
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetHeader } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useFeatureStore } from "@/hooks/stores/useFeatureStore";
import { FeatureService } from "@/services/FeatureService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { getItemId } from "@/utils/product/productItemUtils";
import { useSaveRestoreFeature } from "../../hooks/useSaveRestoreFeature";
import { getDefaultItem } from "../../utils/getDefaultItem";
import { NewFeatureAdvanced } from "./NewFeatureAdvanced";
import { NewFeatureBehaviour } from "./NewFeatureBehaviour";
import { NewFeatureDetails } from "./NewFeatureDetails";
import { NewFeatureType } from "./NewFeatureType";

export function NewFeatureSheet({ isOnboarding }: { isOnboarding?: boolean }) {
	// Save/restore onboarding context and reset feature store for fresh creation
	// This hook always resets on mount, but only saves/restores when enabled
	useSaveRestoreFeature({ enabled: !!isOnboarding });

	const feature = useFeatureStore((s) => s.feature);
	const setFeature = useFeatureStore((s) => s.setFeature);
	const { product, setProduct } = useProduct();
	const { setSheet } = useSheet();
	const axiosInstance = useAxiosInstance();
	const { refetch } = useFeaturesQuery();
	const [isCreating, setIsCreating] = useState(false);

	const handleCreateFeature = async () => {
		setIsCreating(true);
		const result = CreateFeatureSchema.safeParse(feature);
		if (result.error) {
			console.log(result.error.issues);
			toast.error("Invalid feature", {
				description: result.error.issues.map((x) => x.message).join(".\n"),
			});
			setIsCreating(false);
		} else {
			try {
				const { data: newFeature } = await FeatureService.createFeature(
					axiosInstance,
					{
						name: feature.name,
						id: feature.id,
						type: feature.type,
						consumable: feature.config?.usage_type === FeatureUsageType.Single,
						event_names: feature.event_names,
					},
				);

				await refetch();

				if (!product || !newFeature.id) return;

				// Create a new item with the created feature
				const newItem = getDefaultItem({
					feature: featureV1ToDbFeature({ apiFeature: newFeature }),
				});

				// Add the new item to the product
				const newItems = [...(product.items || []), newItem];
				const updatedProduct = { ...product, items: newItems };
				setProduct(updatedProduct);

				// Open edit sidebar for the new item
				// Use the actual index in newItems where the item was added (at the end)
				// NOT featureItems.length - 1, which causes index mismatch on paid plans with base price items
				const itemIndex = newItems.length - 1;
				const itemId = getItemId({ item: newItem, itemIndex });

				// Use setTimeout to ensure state updates propagate
				setTimeout(() => {
					setSheet({ type: "edit-feature", itemId });
				}, 0);
			} catch (error: unknown) {
				toast.error(
					getBackendErr(error as AxiosError, "Failed to create feature"),
				);
				setIsCreating(false);
			}
		}
	};

	const handleCancel = () => {
		// Always go back to edit-plan sheet
		// In both onboarding and normal flow, this is the expected behavior
		setSheet({ type: "edit-plan" });
	};

	return (
		<div className="flex flex-col h-full">
			{!isOnboarding && (
				<SheetHeader
					title="New Feature"
					description="Create a feature for a part of your product you want to gate behind specific plans. Then, add it to a plan."
				/>
			)}

			<NewFeatureDetails feature={feature} setFeature={setFeature} />

			<NewFeatureType feature={feature} setFeature={setFeature} />

			<NewFeatureBehaviour feature={feature} setFeature={setFeature} />

			<NewFeatureAdvanced feature={feature} setFeature={setFeature} />

			<div className="mt-auto p-4 w-full flex-row grid grid-cols-2 gap-2">
				<ShortcutButton
					variant="secondary"
					className="w-full"
					onClick={handleCancel}
					singleShortcut="escape"
				>
					Cancel
				</ShortcutButton>
				<ShortcutButton
					className="w-full"
					onClick={handleCreateFeature}
					metaShortcut="enter"
					isLoading={isCreating}
				>
					Create feature
				</ShortcutButton>
			</div>
		</div>
	);
}
