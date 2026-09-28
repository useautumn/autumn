import type { ProductV2 } from "@autumn/shared";
import { SearchableSelect } from "@autumn/ui";
import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { getProductGroupKey } from "@/components/forms/shared/utils/planGroupUtils";
import { PlanPickerScopeRow } from "./PlanPickerScopeRow";

/** Full-bleed row trigger, so the popover anchors to the whole row. */
function PlanPickerTrigger(props: ComponentProps<"button">) {
	return (
		<button
			type="button"
			{...props}
			className="flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-2 px-3 text-left text-sm text-tertiary-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground disabled:cursor-not-allowed data-popup-open:text-foreground"
		>
			<span className="min-w-0 flex-1 truncate">Select a plan…</span>
			<ChevronDownIcon className="size-4 shrink-0 opacity-50" />
		</button>
	);
}

/** The empty plan row: a product picker that greys out conflicting groups. */
export function CustomerStatePlanPicker({
	products,
	usedKeys,
	siblingProductIds,
	header,
	scope,
	disabled,
	onSelect,
}: {
	products: ProductV2[];
	usedKeys: Set<string>;
	siblingProductIds: Set<string>;
	header?: ReactNode;
	scope?: ComponentProps<typeof PlanPickerScopeRow>;
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
			disabled={disabled}
		/>
	);
}
