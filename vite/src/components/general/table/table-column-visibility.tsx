import { FadersHorizontalIcon } from "@phosphor-icons/react";
import type { Column, VisibilityState } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { Checkbox } from "@/components/v2/checkboxes/Checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import type { ColumnGroup } from "@/hooks/useColumnVisibility";
import { cn } from "@/lib/utils";
import { useTableContext } from "./table-context";

const STORAGE_PREFIX = "autumn:table-columns:";

function getStorageKey(key: string): string {
	return `${STORAGE_PREFIX}${key}`;
}

function loadFromStorage(storageKey: string): VisibilityState | null {
	try {
		const saved = localStorage.getItem(getStorageKey(storageKey));
		if (saved) {
			return JSON.parse(saved) as VisibilityState;
		}
	} catch {
		// Ignore parsing errors
	}
	return null;
}

function saveToStorage(storageKey: string, state: VisibilityState): void {
	try {
		localStorage.setItem(getStorageKey(storageKey), JSON.stringify(state));
	} catch {
		// Ignore storage errors
	}
}

/** Renders a single column checkbox item */
function ColumnCheckboxItem<T>({ column }: { column: Column<T> }) {
	const header = column.columnDef.header;
	const label = typeof header === "string" ? header : column.id;

	// Skip empty labels (like actions column)
	if (!label || label === "actions") return null;

	const isVisible = column.getIsVisible();

	return (
		<DropdownMenuItem
			key={column.id}
			onClick={(e) => {
				e.preventDefault();
				column.toggleVisibility(!isVisible);
			}}
			onSelect={(e) => e.preventDefault()}
			className="flex items-center gap-2 cursor-pointer text-sm"
		>
			<Checkbox checked={isVisible} className="border-border" />
			{label}
		</DropdownMenuItem>
	);
}

/** Renders a submenu for a column group */
function ColumnGroupSubmenu<T>({
	group,
	columns,
}: {
	group: ColumnGroup;
	columns: Column<T>[];
}) {
	// Filter columns that belong to this group
	const groupColumns = columns.filter((col) =>
		group.columnIds.includes(col.id),
	);

	// Count visible columns in this group
	const visibleCount = groupColumns.filter((col) => col.getIsVisible()).length;

	if (groupColumns.length === 0) {
		return null;
	}

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer text-sm">
				{group.label}
				{visibleCount > 0 && (
					<span className="text-xs text-t3 bg-muted px-1 py-0 rounded-md">
						{visibleCount}
					</span>
				)}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="min-w-[200px]">
				{groupColumns.length === 0 ? (
					<div className="px-2 py-3 text-center text-t3 text-sm">
						No columns available
					</div>
				) : (
					<div className="max-h-64 overflow-y-auto">
						{groupColumns.map((column) => (
							<ColumnCheckboxItem key={column.id} column={column} />
						))}
					</div>
				)}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

export function TableColumnVisibility() {
	const [isOpen, setIsOpen] = useState(false);

	const {
		table,
		enableColumnVisibility,
		columnVisibilityStorageKey,
		columnGroups = [],
		columnVisibilityInToolbar,
	} = useTableContext();

	// Load saved state synchronously on mount (for comparison to detect unsaved changes)
	const [savedVisibility, setSavedVisibility] =
		useState<VisibilityState | null>(() => {
			if (!columnVisibilityStorageKey) return null;
			return loadFromStorage(columnVisibilityStorageKey);
		});

	// Get current visibility from table for comparison
	const currentVisibility = table.getState().columnVisibility;

	// Collect all column IDs that belong to any group
	const groupedColumnIds = useMemo(() => {
		const ids = new Set<string>();
		for (const group of columnGroups) {
			for (const colId of group.columnIds) {
				ids.add(colId);
			}
		}
		return ids;
	}, [columnGroups]);

	// Check if current visibility differs from saved state
	const hasUnsavedChanges = useMemo(() => {
		if (!columnVisibilityStorageKey) return false;

		const currentKeys = Object.keys(currentVisibility);

		// If nothing saved yet, show save button if there are any visibility changes
		if (savedVisibility === null) {
			// Check if any column has explicit visibility set (not just defaults)
			return currentKeys.length > 0;
		}

		const savedKeys = Object.keys(savedVisibility);

		// Only compare keys that exist in both
		for (const key of currentKeys) {
			if (
				key in savedVisibility &&
				currentVisibility[key] !== savedVisibility[key]
			) {
				return true;
			}
		}

		// Check if saved has keys not in current
		for (const key of savedKeys) {
			if (
				key in currentVisibility &&
				savedVisibility[key] !== currentVisibility[key]
			) {
				return true;
			}
		}

		// Check if there are new keys in current that weren't in saved
		for (const key of currentKeys) {
			if (!(key in savedVisibility)) {
				return true;
			}
		}

		return false;
	}, [columnVisibilityStorageKey, currentVisibility, savedVisibility]);

	// Save current visibility to localStorage
	const handleSave = () => {
		if (columnVisibilityStorageKey) {
			saveToStorage(columnVisibilityStorageKey, currentVisibility);
			setSavedVisibility({ ...currentVisibility });
		}
	};

	if (!enableColumnVisibility) {
		return null;
	}

	// All hideable columns
	const allColumns = table
		.getAllColumns()
		.filter((column) => column.getCanHide());

	// Base columns (not in any group)
	const baseColumns = allColumns.filter((col) => !groupedColumnIds.has(col.id));

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				{columnVisibilityInToolbar ? (
					<IconButton
						variant="secondary"
						className={cn(isOpen && "btn-secondary-active")}
						icon={
							<FadersHorizontalIcon
								size={14}
								weight="bold"
								className="text-t3"
							/>
						}
					>
						Display
					</IconButton>
				) : (
					<Button
						variant="skeleton"
						size="icon"
						className={cn(
							"p-0 size-5 pointer-events-auto bg-card",
							isOpen && "border-primary bg-interactive-secondary-hover",
						)}
						onClick={(e) => {
							e.stopPropagation();
						}}
					>
						<FadersHorizontalIcon
							size={14}
							weight="bold"
							className="text-t3 size-3.5"
						/>
					</Button>
				)}
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				side="right"
				className="min-w-[150px] relative"
			>
				{/* Base columns (not in any group) */}
				{baseColumns.map((column) => (
					<ColumnCheckboxItem key={column.id} column={column} />
				))}

				{/* Column groups as submenus */}
				{columnGroups.length > 0 && baseColumns.length > 0 && (
					<DropdownMenuSeparator />
				)}
				{columnGroups.map((group) => (
					<ColumnGroupSubmenu
						key={group.key}
						group={group}
						columns={allColumns}
					/>
				))}

				{/* Animate height using grid technique */}
				<div
					className={cn(
						"grid transition-[grid-template-rows] duration-100 ease-in-out",
						hasUnsavedChanges ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
					)}
				>
					<div className="overflow-hidden">
						<div className="p-1 pt-2">
							<Button
								variant="secondary"
								size="sm"
								className="w-full h-7 text-xs"
								onClick={(e) => {
									e.stopPropagation();
									handleSave();
								}}
							>
								Save
							</Button>
						</div>
					</div>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
