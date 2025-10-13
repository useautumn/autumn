import type { ProductV2 } from "@autumn/shared";
import { FormLabel } from "@/components/v2/form/FormLabel";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { isFreeProduct } from "@/utils/product/priceUtils";
import type { FrontendReward } from "../../types/frontendReward";

interface FreeProductRewardConfigProps {
	reward: FrontendReward;
	setReward: (reward: FrontendReward) => void;
}

export function FreeProductRewardConfig({
	reward,
	setReward,
}: FreeProductRewardConfigProps) {
	const { products } = useProductsQuery();

	const freeAddOns = products
		.filter((product: ProductV2) => product.is_add_on)
		.filter((product: ProductV2) => isFreeProduct(product.items));

	const isEmpty = freeAddOns.length === 0;

	return (
		<SheetSection title="Free Product Configuration" withSeparator={false}>
			{/* Product Selection */}
			<div>
				<FormLabel>Product</FormLabel>
				<Select
					value={reward.free_product_id || undefined}
					onValueChange={(value) =>
						setReward({ ...reward, free_product_id: value })
					}
					disabled={isEmpty}
				>
					<SelectTrigger>
						<SelectValue
							placeholder={
								isEmpty
									? "Create a free add-on product first"
									: "Select a free add-on product"
							}
						/>
					</SelectTrigger>
					<SelectContent>
						{freeAddOns.map((product: ProductV2) => (
							<SelectItem key={product.id} value={product.id}>
								{product.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{isEmpty && (
					<p className="text-xs text-t3 mt-1">
						You need to create a free add-on product to use this reward type
					</p>
				)}
			</div>
		</SheetSection>
	);
}
