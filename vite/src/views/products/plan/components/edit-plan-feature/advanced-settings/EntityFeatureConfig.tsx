import { FeatureUsageType } from "@autumn/shared";
import { AreaCheckbox } from "@/components/v2/checkboxes/AreaCheckbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { getFeature } from "@/utils/product/entitlementUtils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function EntityFeatureConfig() {
	const { features } = useFeaturesQuery();
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	// Get the current item's feature
	const currentFeature = getFeature(item.feature_id ?? "", features);

	// Don't show if the current item itself is a continuous use feature
	if (currentFeature?.config?.usage_type === FeatureUsageType.Continuous) {
		return null;
	}

	// Filter for continuous use features
	const continuousUseFeatures = features.filter(
		(f) => f.config?.usage_type === FeatureUsageType.Continuous,
	);

	// Don't show if there are no continuous use features available
	if (continuousUseFeatures.length === 0) {
		return null;
	}

	return (
		<AreaCheckbox
			title="Per entity feature"
			description="Link this item to a specific feature entity in your app"
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
			<Select
				value={item.entity_feature_id || undefined}
				onValueChange={(value) => {
					setItem({
						...item,
						entity_feature_id: value,
					});
				}}
			>
				<SelectTrigger className="w-2/3" onClick={(e) => e.stopPropagation()}>
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
