import type { Entity } from "@autumn/shared";
import { DropdownMenuItem } from "@autumn/ui";
import { CheckIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { EntityOptionRow } from "./EntityOptionRow";

const entityValue = (entity: Entity) => entity.id || entity.internal_id;

/** The scope picker's options as menu items, for a "Move to" submenu. */
export function PlanScopeMenuItems({
	entities,
	value,
	isLoading,
	onSearchChange,
	onChange,
}: {
	entities: Entity[];
	value: string | null;
	isLoading: boolean;
	onSearchChange: (search: string) => void;
	onChange: (entityId: string | null) => void;
}) {
	const searchRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		searchRef.current?.focus();
	}, []);

	return (
		<>
			<input
				ref={searchRef}
				aria-label="Search entities"
				className="mb-1 h-7 w-full rounded-md border border-border bg-transparent px-2 text-sm text-foreground outline-none placeholder:text-tertiary-foreground focus-visible:border-primary"
				onChange={(event) => onSearchChange(event.target.value)}
				onKeyDown={(event) => event.stopPropagation()}
				placeholder="Search entities..."
			/>
			<DropdownMenuItem onClick={() => onChange(null)}>
				<span className="flex-1 truncate text-sm">Customer-level</span>
				{value === null && <CheckIcon className="size-4 shrink-0" />}
			</DropdownMenuItem>
			{entities.map((entity) => (
				<DropdownMenuItem
					key={entityValue(entity)}
					onClick={() => onChange(entityValue(entity))}
				>
					<EntityOptionRow
						entity={entity}
						isSelected={value === entityValue(entity)}
					/>
				</DropdownMenuItem>
			))}
			{!isLoading && entities.length === 0 && (
				<p className="px-2 py-1.5 text-xs text-tertiary-foreground">
					No entities found
				</p>
			)}
		</>
	);
}
