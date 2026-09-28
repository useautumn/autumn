import type { ProductV2 } from "@autumn/shared";
import { SearchableSelect } from "@autumn/ui";
import { type ComponentProps, type ReactNode, useState } from "react";
import { getProductGroupKey } from "@/components/forms/shared/utils/planGroupUtils";
import { useCustomerStateContext } from "../CustomerStateProvider";
import { PlanPickerScopeRow } from "./PlanPickerScopeRow";
import { PlanPickerTrigger } from "./PlanPickerTrigger";

/** The empty plan row: a product picker that greys out conflicting groups. */
export function CustomerStatePlanPicker({
	products,
	usedKeys,
	siblingProductIds,
	header,
	scope,
	disabled,
	onSelect,
	onDismiss,
}: {
	products: ProductV2[];
	usedKeys: Set<string>;
	siblingProductIds: Set<string>;
	header?: ReactNode;
	scope?: ComponentProps<typeof PlanPickerScopeRow>;
	disabled?: boolean;
	onSelect: (productId: string) => void;
	onDismiss?: () => void;
}) {
	const { shouldOpenPickerImmediately } = useCustomerStateContext();
	const [open, setOpen] = useState(shouldOpenPickerImmediately);
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
			header={
				<>
					{scope && <PlanPickerScopeRow {...scope} />}
					{header}
				</>
			}
			trigger={<PlanPickerTrigger disabled={disabled} />}
			searchable
			searchPlaceholder="Search plans..."
			emptyText="No plans found"
			defaultOpen
			open={open}
			onOpenChange={(isOpen) => {
				setOpen(isOpen);
				if (!isOpen) onDismiss?.();
			}}
			disabled={disabled}
		/>
	);
}
