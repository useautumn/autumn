import type { ProductV2 } from "@autumn/shared";
import { SearchableSelect } from "@autumn/ui";
import type { ReactNode } from "react";
import { getProductGroupKey } from "@/components/forms/shared/utils/planGroupUtils";

/** The empty plan row: a product picker that greys out conflicting groups. */
export function SchedulePlanPicker({
	products,
	usedKeys,
	siblingProductIds,
	header,
	disabled,
	onSelect,
}: {
	products: ProductV2[];
	usedKeys: Set<string>;
	siblingProductIds: Set<string>;
	header?: ReactNode;
	disabled?: boolean;
	onSelect: (productId: string) => void;
}) {
	const isGroupUsed = (product: ProductV2) =>
		usedKeys.has(getProductGroupKey({ productId: product.id, products }));

	return (
		<SearchableSelect
			value={null}
			onValueChange={onSelect}
			options={products}
			getOptionValue={(product) => product.id}
			getOptionLabel={(product) => product.name}
			getOptionDisabled={isGroupUsed}
			renderOption={(product) => (
				<>
					<span className="flex-1 truncate min-w-0">{product.name}</span>
					{siblingProductIds.has(product.id) && (
						<span className="text-xs text-subtle shrink-0">
							Already selected
						</span>
					)}
					{!siblingProductIds.has(product.id) && isGroupUsed(product) && (
						<span className="text-xs text-subtle shrink-0">Group conflict</span>
					)}
				</>
			)}
			header={header}
			placeholder="Select product..."
			searchable
			searchPlaceholder="Search products..."
			emptyText="No products found"
			defaultOpen
			disabled={disabled}
		/>
	);
}
