import type { Entity } from "@autumn/shared";
import type { SearchableSelectFooter } from "@autumn/ui";
import { SearchableSelect } from "@autumn/ui";
import { CheckIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";

// Non-empty sentinel: cmdk derives a value from text content for empty ones,
// which breaks both selection matching and clicking.
const CUSTOMER_LEVEL_VALUE = "__customer_level__";
const INHERITED_VALUE = "__inherited__";
type EntityOption = Entity | null | typeof INHERITED_VALUE;

const getOptionValue = (option: EntityOption) => {
	if (option === INHERITED_VALUE) return INHERITED_VALUE;
	if (option === null) return CUSTOMER_LEVEL_VALUE;
	return option.id || option.internal_id;
};

export function PlanEntityScopeSelector({
	entities,
	value,
	onChange,
	inheritLabel,
	footer,
	withSeparator = true,
	wrapInSection = true,
	showLabel = true,
	onSearchChange,
	isLoading,
	trigger,
	open,
	onOpenChange,
	disabled,
}: {
	entities: Entity[];
	value: string | null | undefined;
	onChange: (entityId: string | null | undefined) => void;
	inheritLabel?: string;
	footer?: SearchableSelectFooter;
	withSeparator?: boolean;
	wrapInSection?: boolean;
	showLabel?: boolean;
	onSearchChange?: (search: string) => void;
	isLoading?: boolean;
	disabled?: boolean;
	/** Renders the picker as a popover off this element instead of a full-width select. */
	trigger?: ReactNode;
	open?: boolean;
	onOpenChange?: (nextOpen: boolean) => void;
}) {
	const options: EntityOption[] = [
		...(inheritLabel ? [INHERITED_VALUE as const] : []),
		null,
		...entities,
	];
	const selectedValue =
		value === undefined && inheritLabel
			? INHERITED_VALUE
			: (value ?? CUSTOMER_LEVEL_VALUE);

	const getLabel = (option: EntityOption) => {
		if (option === INHERITED_VALUE) return inheritLabel ?? "Default scope";
		if (option === null) return "Customer-level";
		return option.name || option.id || "PENDING";
	};

	const picker = (
		<SearchableSelect<EntityOption>
			value={selectedValue}
			onValueChange={(nextValue) => {
				if (nextValue === INHERITED_VALUE) return onChange(undefined);
				if (nextValue === CUSTOMER_LEVEL_VALUE) return onChange(null);
				onChange(nextValue);
			}}
			options={options}
			getOptionValue={getOptionValue}
			getOptionLabel={getLabel}
			disabled={disabled}
			placeholder="Select entity"
			searchable
			searchPlaceholder="Search entities..."
			emptyText="No entities found"
			triggerClassName="w-full"
			trigger={trigger}
			contentClassName={trigger ? "w-64" : undefined}
			open={open}
			onOpenChange={onOpenChange}
			onSearchChange={onSearchChange}
			isLoading={isLoading}
			renderValue={(option) => (
				<span className="truncate text-muted-foreground">
					{option === undefined ? getLabel(null) : getLabel(option)}
				</span>
			)}
			renderOption={(option, isSelected) => (
				<>
					<div className="flex min-w-0 flex-1 items-center gap-2">
						<span className="shrink-0 text-sm">{getLabel(option)}</span>
						{option && option !== INHERITED_VALUE && option.name && (
							<span className="min-w-0 truncate font-mono text-xs text-tertiary-foreground">
								{option.id || option.internal_id}
							</span>
						)}
					</div>
					{isSelected && <CheckIcon className="size-4 shrink-0" />}
				</>
			)}
			footer={footer}
		/>
	);

	if (trigger) return picker;

	const select = (
		<div>
			{showLabel && <div className="text-form-label mb-1">Select scope</div>}
			{picker}
		</div>
	);

	if (!wrapInSection) return select;
	return <SheetSection withSeparator={withSeparator}>{select}</SheetSection>;
}
