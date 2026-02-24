import { FadersHorizontalIcon } from "@phosphor-icons/react";
import type { Column } from "@tanstack/react-table";
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

function ColumnCheckboxItem<T>({ column }: { column: Column<T> }) {
	const header = column.columnDef.header;
	const label = typeof header === "string" ? header : column.id;

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

function ColumnGroupSubmenu<T>({
	group,
	columns,
}: {
	group: ColumnGroup;
	columns: Column<T>[];
}) {
	const groupColumns = columns.filter((col) =>
		group.columnIds.includes(col.id),
	);

	const visibleCount = groupColumns.filter((col) => col.getIsVisible()).length;

	if (groupColumns.length === 0) return null;

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
		columnGroups = [],
		columnVisibilityIsDirty = false,
		onColumnVisibilitySave,
		columnVisibilityInToolbar,
	} = useTableContext();

	const groupedColumnIds = useMemo(() => {
		const ids = new Set<string>();
		for (const group of columnGroups) {
			for (const colId of group.columnIds) {
				ids.add(colId);
			}
		}
		return ids;
	}, [columnGroups]);

	if (!enableColumnVisibility) return null;

	const allColumns = table
		.getAllColumns()
		.filter((column) => column.getCanHide());

	const baseColumns = allColumns.filter((col) => !groupedColumnIds.has(col.id));

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				{columnVisibilityInToolbar ? (
					<IconButton
						variant="secondary"
						className={cn(isOpen && "btn-secondary-active")}
						icon={<FadersHorizontalIcon size={14} className="text-t3" />}
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
				{baseColumns.map((column) => (
					<ColumnCheckboxItem key={column.id} column={column} />
				))}

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

				{onColumnVisibilitySave && (
					<div
						className={cn(
							"grid transition-[grid-template-rows] duration-100 ease-in-out",
							columnVisibilityIsDirty ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
						)}
					>
						<div className="overflow-hidden">
							<div className="p-1 pt-2">
								<Button
									variant="primary"
									size="mini"
									className="w-full h-6 text-xs"
									onClick={(e) => {
										e.stopPropagation();
										onColumnVisibilitySave();
									}}
								>
									Save
								</Button>
							</div>
						</div>
					</div>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
