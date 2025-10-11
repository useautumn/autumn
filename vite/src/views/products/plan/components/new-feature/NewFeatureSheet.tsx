import {
	CreateFeatureSchema,
	ProductItemInterval,
	productV2ToFeatureItems,
} from "@autumn/shared";
import type { AxiosError } from "axios";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { SheetHeader } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useFeatureStore } from "@/hooks/stores/useFeatureStore";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { FeatureService } from "@/services/FeatureService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { getItemId } from "@/utils/product/productItemUtils";
import { NewFeatureAdvanced } from "./NewFeatureAdvanced";
import { NewFeatureBehaviour } from "./NewFeatureBehaviour";
import { NewFeatureDetails } from "./NewFeatureDetails";
import { NewFeatureType } from "./NewFeatureType";

export function NewFeatureSheet({ isOnboarding }: { isOnboarding?: boolean }) {
	const feature = useFeatureStore((s) => s.feature);
	const setFeature = useFeatureStore((s) => s.setFeature);
	const product = useProductStore((s) => s.product);
	const setProduct = useProductStore((s) => s.setProduct);
	const setSheet = useSheetStore((s) => s.setSheet);
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const axiosInstance = useAxiosInstance();
	const { refetch } = useFeaturesQuery();

	const handleCreateFeature = async () => {
		const result = CreateFeatureSchema.safeParse(feature);
		if (result.error) {
			console.log(result.error.issues);
			toast.error("Invalid feature", {
				description: result.error.issues.map((x) => x.message).join(".\n"),
			});
		} else {
			try {
				const { data: newFeature } = await FeatureService.createFeature(
					axiosInstance,
					{
						name: feature.name,
						id: feature.id,
						type: feature.type,
						config: feature.config,
					},
				);

				await refetch();

				if (!product || !newFeature.id) return;

				// Create a new item with the created feature
				const newItem = {
					feature_id: newFeature.id,
					included_usage: null,
					interval: ProductItemInterval.Month,
					price: null,
					tiers: null,
					billing_units: 1,
					entity_feature_id: null,
					reset_usage_when_enabled: true,
				};

				// Add the new item to the product
				const newItems = [...(product.items || []), newItem];
				const updatedProduct = { ...product, items: newItems };
				setProduct(updatedProduct);

				// Open edit sidebar for the new item - use feature items index like AddFeatureRow
				const featureItems = productV2ToFeatureItems({ items: newItems });
				const itemIndex = featureItems.length - 1;
				const itemId = getItemId({ item: newItem, itemIndex });

				// Use setTimeout to ensure state updates propagate
				setTimeout(() => {
					setSheet({ type: "edit-feature", itemId });
				}, 0);
			} catch (error: unknown) {
				toast.error(
					getBackendErr(error as AxiosError, "Failed to create feature"),
				);
			}
		}
	};

	const handleCancel = () => {
		if (isOnboarding) {
			// In onboarding, just close the sheet and return to previous state
			closeSheet();
		} else {
			// In normal flow, go back to edit-plan
			setSheet({ type: "edit-plan" });
		}
	};

	return (
		<div className="flex flex-col h-full">
			{!isOnboarding && (
				<SheetHeader
					title="New Feature"
					description="Configure how this feature is used in your app"
				/>
			)}

			<NewFeatureDetails feature={feature} setFeature={setFeature} />

			<NewFeatureType feature={feature} setFeature={setFeature} />

			<NewFeatureBehaviour feature={feature} setFeature={setFeature} />

			<NewFeatureAdvanced feature={feature} setFeature={setFeature} />

			<div className="mt-auto p-4 w-full flex-row grid grid-cols-2 gap-2">
				<Button variant="secondary" className="w-full" onClick={handleCancel}>
					Cancel
				</Button>
				<Button className="w-full" onClick={handleCreateFeature}>
					Create feature
				</Button>
			</div>
		</div>
	);
}
