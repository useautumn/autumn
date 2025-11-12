import { notNullish } from "@autumn/shared";
import { AreaCheckbox } from "@/components/v2/checkboxes/AreaCheckbox";
import { Input } from "@/components/v2/inputs/Input";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function UsageLimit() {
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	return (
		<AreaCheckbox
			title="Max purchase limit"
			// tooltip="Set maximum usage limits for this feature to prevent overages"
			description="A limit on the maximum amount of this feature a customer can purchase, including any included usage."
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
				className="w-xs max-w-full"
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
