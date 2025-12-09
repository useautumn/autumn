import { FadersHorizontalIcon } from "@phosphor-icons/react";
import type { VisibilityState } from "@tanstack/react-table";
import { useLayoutEffect, useMemo, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/v2/buttons/Button";
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

export function TableColumnVisibility() {
	const [isOpen, setIsOpen] = useState(false);

	const { table, enableColumnVisibility, columnVisibilityStorageKey } =
		useTableContext();

	// Load saved state synchronously on mount
	const [savedVisibility, setSavedVisibility] =
		useState<VisibilityState | null>(() => {
			if (!columnVisibilityStorageKey) return null;
			return loadFromStorage(columnVisibilityStorageKey);
		});

	// Apply saved visibility to table before paint (no flash)
	useLayoutEffect(() => {
		if (savedVisibility && columnVisibilityStorageKey) {
			table.setColumnVisibility(savedVisibility);
		}
	}, []);

	// Get current visibility from table for comparison
	const currentVisibility = table.getState().columnVisibility;

	// Check if current visibility differs from saved state
	const hasUnsavedChanges = useMemo(() => {
		if (!columnVisibilityStorageKey) return false;
		if (savedVisibility === null) return false;

		const currentKeys = Object.keys(currentVisibility);
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

		return false;
	}, [columnVisibilityStorageKey, currentVisibility, savedVisibility]);

	// Save current visibility to localStorage
	const handleSave = () => {
		if (!columnVisibilityStorageKey) return;
		saveToStorage(columnVisibilityStorageKey, currentVisibility);
		setSavedVisibility({ ...currentVisibility });
	};

	if (!enableColumnVisibility) {
		return null;
	}

	const columns = table.getAllColumns().filter((column) => column.getCanHide());

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
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
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-[150px] relative">
				{columns.map((column) => {
					const header = column.columnDef.header;
					const label = typeof header === "string" ? header : column.id;

					return (
						<DropdownMenuCheckboxItem
							key={column.id}
							checked={column.getIsVisible()}
							onCheckedChange={(value) => column.toggleVisibility(!!value)}
							onSelect={(e) => e.preventDefault()}
							className="text-sm"
						>
							{label}
						</DropdownMenuCheckboxItem>
					);
				})}
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
