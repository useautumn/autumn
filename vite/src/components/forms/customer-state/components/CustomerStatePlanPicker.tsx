import type { ProductV2 } from "@autumn/shared";
import { SearchableSelect } from "@autumn/ui";
import { type ComponentProps, type ReactNode, useRef, useState } from "react";
import { getProductGroupKey } from "@/components/forms/shared/utils/planGroupUtils";
import { useCustomerStateContext } from "../CustomerStateProvider";
import { PlanOptionStatus } from "./PlanOptionStatus";
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
	const { shouldOpenPickerImmediately, findSubscriptionConflict } =
		useCustomerStateContext();
	const [open, setOpen] = useState(shouldOpenPickerImmediately);
	const hasSelected = useRef(false);
	const isGroupUsed = (product: ProductV2) =>
		usedKeys.has(getProductGroupKey({ productId: product.id, products }));
	const subscriptionConflictOf = (product: ProductV2) =>
		findSubscriptionConflict({ product, entityId: scope?.value ?? null });

	return (
		<SearchableSelect
			value={null}
			onValueChange={(productId) => {
				hasSelected.current = true;
				onSelect(productId);
			}}
			options={products}
			getOptionValue={(product) => product.id}
			getOptionLabel={(product) => product.name}
			getOptionDisabled={(product) =>
				isGroupUsed(product) || Boolean(subscriptionConflictOf(product))
			}
			renderOption={(product) => (
				<>
					<span className="flex-1 truncate min-w-0">{product.name}</span>
					<PlanOptionStatus
						isSelectedElsewhere={siblingProductIds.has(product.id)}
						isGroupUsed={isGroupUsed(product)}
						subscriptionConflict={subscriptionConflictOf(product)}
						productName={product.name}
					/>
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
				if (!(isOpen || hasSelected.current)) onDismiss?.();
			}}
			disabled={disabled}
		/>
	);
}
