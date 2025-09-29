import { CreateFeatureSchema, ProductItemInterval, productV2ToFeatureItems } from "@autumn/shared";
import type { AxiosError } from "axios";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { SheetHeader } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { FeatureService } from "@/services/FeatureService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { getItemId } from "@/utils/product/productItemUtils";
import { getDefaultFeature } from "@/views/products/features/utils/defaultFeature";
import { useProductContext } from "@/views/products/product/ProductContext";
import { NewFeatureAdvanced } from "./NewFeatureAdvanced";
import { NewFeatureBehaviour } from "./NewFeatureBehaviour";
import { NewFeatureDetails } from "./NewFeatureDetails";
import { NewFeatureType } from "./NewFeatureType";

export function NewFeatureSheet() {
	const [feature, setFeature] = useState(getDefaultFeature());
	const { product, setProduct, setSheet, setEditingState } =
		useProductContext();
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
					setEditingState({ type: "feature", id: itemId });
					setSheet("edit-feature");
				}, 0);
			} catch (error: unknown) {
				toast.error(
					getBackendErr(error as AxiosError, "Failed to create feature"),
				);
			}
		}
	};

	return (
		<div className="flex flex-col h-full">
			<SheetHeader
				title="New Feature"
				description="Configure how this feature is used in your app"
			/>

			<NewFeatureDetails feature={feature} setFeature={setFeature} />

			<NewFeatureType feature={feature} setFeature={setFeature} />

			<NewFeatureBehaviour feature={feature} setFeature={setFeature} />

			<NewFeatureAdvanced feature={feature} setFeature={setFeature} />

			<div className="mt-auto p-4 w-full flex-row grid grid-cols-2 gap-2">
				<Button
					variant="secondary"
					className="w-full"
					onClick={() => setSheet("edit-plan")}
				>
					Cancel
				</Button>
				<Button className="w-full" onClick={handleCreateFeature}>
					Create feature
				</Button>
			</div>
		</div>
	);
}
