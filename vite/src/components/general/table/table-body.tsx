import { flexRender } from "@tanstack/react-table";
import { Link } from "react-router";
import { Checkbox } from "@/components/ui/checkbox";
import {
	TableBody as ShadcnTableBody,
	TableCell,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import SmallSpinner from "../SmallSpinner";
import { useTableContext } from "./table-context";

export function TableBody() {
	const {
		table,
		numberOfColumns,
		enableSelection,
		isLoading,
		getRowHref,
		onRowClick,
		rowClassName,
		emptyStateChildren,
		emptyStateText,
		selectedItemId,
		flexibleTableColumns,
	} = useTableContext();
	const rows = table.getRowModel().rows;

	if (!rows.length) {
		return (
			<ShadcnTableBody>
				<TableRow className="hover:bg-transparent dark:hover:bg-transparent">
					<TableCell
						className="h-10 text-center py-0"
						colSpan={numberOfColumns}
					>
						{isLoading ? (
							<div className="flex justify-center items-center">
								<SmallSpinner />
							</div>
						) : (
							<div className="text-t4 text-center w-full h-full items-center justify-center flex">
								{emptyStateChildren || emptyStateText}
							</div>
						)}
					</TableCell>
				</TableRow>
			</ShadcnTableBody>
		);
	}

	return (
		<ShadcnTableBody className="divide-y bg-interactive-secondary">
			{rows.map((row) => {
				const isSelected = selectedItemId === (row.original as any).id;
				const rowHref = getRowHref?.(row.original);

				return (
					<TableRow
						className={cn(
							"text-t3 transition-none h-12 py-4 relative",
							rowClassName,
							isSelected ? "z-100" : "hover:bg-interactive-secondary-hover",
						)}
						data-state={row.getIsSelected() && "selected"}
						key={row.id}
						onClick={!rowHref ? () => onRowClick?.(row.original) : undefined}
					>
						{enableSelection && (
							<TableCell className="w-[50px]">
								<Checkbox
									aria-label="Select row"
									checked={row.getIsSelected()}
									onCheckedChange={(checked) => row.toggleSelected(!!checked)}
								/>
							</TableCell>
						)}
						{row.getVisibleCells().map((cell, index) => {
							const cellContent = flexRender(
								cell.column.columnDef.cell,
								cell.getContext(),
							);
							const cellStyle = flexibleTableColumns
								? {
										width: `${cell.column.getSize()}px`,
										maxWidth: `${cell.column.getSize()}px`,
										minWidth: cell.column.columnDef.minSize
											? `${cell.column.columnDef.minSize}px`
											: undefined,
									}
								: { width: `${cell.column.getSize()}px` };

							return (
								<TableCell
									className={cn(
										"px-2 h-4 text-t3",
										index === 0 && "pl-4 text-t2 font-medium",
										rowHref && "p-0",
									)}
									key={cell.id}
									style={cellStyle}
								>
									{rowHref ? (
										<Link
											to={rowHref}
											className={cn(
												"flex items-center h-full w-full px-2",
												index === 0 && "pl-4",
											)}
										>
											{cellContent}
										</Link>
									) : (
										cellContent
									)}
								</TableCell>
							);
						})}
					</TableRow>
				);
			})}
		</ShadcnTableBody>
	);
}
