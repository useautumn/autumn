import type { ProductV2 } from "@autumn/shared";
import { SearchableSelect } from "@autumn/ui";
import { type ComponentProps, type ReactNode, useRef, useState } from "react";
import { PlanPickerScopeRow } from "./PlanPickerScopeRow";
import { PlanPickerTrigger } from "./PlanPickerTrigger";

/** The empty plan row: a searchable product picker with an optional "For" scope row. */
export function PlanPicker({
	products,
	header,
	scope,
	disabled,
	defaultOpen = false,
	isOptionDisabled,
	renderOptionStatus,
	onSelect,
	onDismiss,
}: {
	products: ProductV2[];
	header?: ReactNode;
	scope?: ComponentProps<typeof PlanPickerScopeRow>;
	disabled?: boolean;
	defaultOpen?: boolean;
	isOptionDisabled?: (product: ProductV2) => boolean;
	renderOptionStatus?: (product: ProductV2) => ReactNode;
	onSelect: (productId: string) => void;
	onDismiss?: () => void;
}) {
	const [open, setOpen] = useState(defaultOpen);
	const hasSelected = useRef(false);

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
			getOptionDisabled={isOptionDisabled}
			renderOption={(product) => (
				<>
					<span className="flex-1 truncate min-w-0">{product.name}</span>
					{renderOptionStatus?.(product)}
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
