import { notNullish } from "@autumn/shared";
import { AreaCheckbox } from "@/components/v2/checkboxes/AreaCheckbox";
import { Input } from "@/components/v2/inputs/Input";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import {
	getFeatureCreditSystem,
	getFeatureUsageType,
} from "@/utils/product/entitlementUtils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function UsageLimit() {
	const { features } = useFeaturesQuery();
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	const usageType = getFeatureUsageType({ item, features });
	const hasCreditSystem = getFeatureCreditSystem({ item, features });

	return (
		<AreaCheckbox
			title="Usage limit"
			// tooltip="Set maximum usage limits for this feature to prevent overages"
			description="The maximum total amount of this feature a customer can use, including
					their included usage."
			checked={notNullish(item.usage_limit)}
			onCheckedChange={(checked) => {
				let usage_limit: number | null;

				if (checked) {
					usage_limit = 100; // Default value
				} else {
					usage_limit = null;
				}

				console.log("checked", checked, "setting usage limit to", usage_limit);

				setItem({
					...item,
					usage_limit: usage_limit,
				});
			}}
		>
			<Input
				type="number"
				value={item.usage_limit || ""}
				className="w-32"
				onChange={(e) => {
					const value = e.target.value;
					const numValue = value === "" ? 0 : parseInt(value) || null;
					setItem({
						...item,
						usage_limit: numValue,
					});
				}}
				placeholder="e.g. 100"
				onClick={(e) => e.stopPropagation()}
			/>
		</AreaCheckbox>
	);
}
