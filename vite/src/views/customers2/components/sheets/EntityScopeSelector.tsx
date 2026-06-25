import type { Entity } from "@autumn/shared";
import { SearchableSelect } from "@autumn/ui";
import { CheckIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";

const CUSTOMER_LEVEL_VALUE = "";

type EntityOption = Entity | null;

export function EntityScopeSelector({
	entities,
	scopeEntityId,
	onScopeChange,
	footer,
	withSeparator = true,
	wrapInSection = true,
	onSearchChange,
	isLoading,
}: {
	entities: Entity[];
	scopeEntityId: string | undefined;
	onScopeChange: (entityId: string | undefined) => void;
	footer?: ReactNode;
	withSeparator?: boolean;
	wrapInSection?: boolean;
	onSearchChange?: (search: string) => void;
	isLoading?: boolean;
}) {
	const entityOptions: EntityOption[] = [null, ...entities];

	const getEntityOptionValue = (option: EntityOption) =>
		option === null ? CUSTOMER_LEVEL_VALUE : option.id || option.internal_id;

	const getEntityOptionLabel = (option: EntityOption) =>
		option === null ? "Customer-level" : option.name || option.id || "PENDING";

	const select = (
		<div>
			<div className="text-form-label block mb-1">Select scope</div>
			<SearchableSelect<EntityOption>
				value={scopeEntityId ?? CUSTOMER_LEVEL_VALUE}
				onValueChange={(value) =>
					onScopeChange(value === CUSTOMER_LEVEL_VALUE ? undefined : value)
				}
				options={entityOptions}
				getOptionValue={getEntityOptionValue}
				getOptionLabel={getEntityOptionLabel}
				placeholder="Select entity"
				searchable
				searchPlaceholder="Search entities..."
				emptyText="No entities found"
				triggerClassName="w-full"
				onSearchChange={onSearchChange}
				isLoading={isLoading}
				renderValue={(option) =>
					option === null || option === undefined ? (
						<span className="text-muted-foreground">Customer-level</span>
					) : (
						<span className="text-muted-foreground truncate">
							{option.name || option.id || "PENDING"}
						</span>
					)
				}
				renderOption={(option, isSelected) => {
					if (option === null) {
						return (
							<>
								<span className="text-sm">Customer-level</span>
								{isSelected && <CheckIcon className="size-4 shrink-0" />}
							</>
						);
					}
					const entityLabel = option.id || "PENDING";
					return (
						<>
							<div className="flex gap-2 items-center min-w-0 flex-1">
								{option.name && (
									<span className="text-sm shrink-0">{option.name}</span>
								)}
								<span className="truncate text-tertiary-foreground font-mono text-xs min-w-0">
									{entityLabel}
								</span>
							</div>
							{isSelected && <CheckIcon className="size-4 shrink-0" />}
						</>
					);
				}}
				footer={footer}
			/>
		</div>
	);

	if (!wrapInSection) return select;

	return <SheetSection withSeparator={withSeparator}>{select}</SheetSection>;
}
