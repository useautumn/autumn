import { FeatureUsageType } from "@autumn/shared";
import { AreaCheckbox } from "@/components/v2/checkboxes/AreaCheckbox";
import { FormLabel } from "@/components/v2/form/FormLabel";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function EntityFeatureConfig() {
	const { features } = useFeaturesQuery();
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	// Filter for continuous use features, excluding the current feature (can't link to itself)
	const continuousUseFeatures = features.filter(
		(f) =>
			f.config?.usage_type === FeatureUsageType.Continuous &&
			f.id !== item.feature_id,
	);

	// Don't show if there are no other continuous use features available
	if (continuousUseFeatures.length === 0) {
		return null;
	}

	return (
		<AreaCheckbox
			title="Per entity feature"
			// description="Link this item to a specific feature entity in your app"
			checked={item.entity_feature_id != null}
			onCheckedChange={(checked) => {
				setItem({
					...item,
					entity_feature_id: checked
						? continuousUseFeatures[0]?.id || null
						: null,
				});
			}}
		>
			<FormLabel>
				Link this item to a specific feature entity in your app
			</FormLabel>
			<Select
				value={item.entity_feature_id || undefined}
				onValueChange={(value) => {
					setItem({
						...item,
						entity_feature_id: value,
					});
				}}
			>
				<SelectTrigger
					className="w-xs max-w-full"
					onClick={(e) => e.stopPropagation()}
				>
					<SelectValue placeholder="Select a feature" />
				</SelectTrigger>
				<SelectContent>
					{continuousUseFeatures.map((feature) => (
						<SelectItem key={feature.id} value={feature.id}>
							{feature.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</AreaCheckbox>
	);
}
