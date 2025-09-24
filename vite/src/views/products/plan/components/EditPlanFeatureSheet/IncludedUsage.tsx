import { LabelInput } from "@/components/v2/inputs/LabelInput";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function IncludedUsage() {
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	const includedUsage = item.included_usage?.toString() || "";

	return (
		<LabelInput
			label="Included usage before payment"
			placeholder="eg. 100 credits"
			value={includedUsage}
			onChange={(e) => {
				const value = e.target.value;
				const numValue = value === "" ? null : parseInt(value) || 0;
				setItem({ ...item, included_usage: numValue });
			}}
		/>
	);
}
