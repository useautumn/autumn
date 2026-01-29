import type { Row } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { memo, type ReactNode } from "react";
import { Link } from "react-router";
import { Checkbox } from "@/components/ui/checkbox";
import {
	TableBody as ShadcnTableBody,
	TableCell,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import SmallSpinner from "../SmallSpinner";

interface TableRowCellsProps<T> {
	row: Row<T>;
	enableSelection?: boolean;
	flexibleTableColumns?: boolean;
	rowHref?: string;
}

function TableRowCellsInner<T>({
	row,
	enableSelection,
	flexibleTableColumns,
	rowHref,
}: TableRowCellsProps<T>) {
	return (
		<>
			{enableSelection && (
				<TableCell className="w-[50px]">
					<Checkbox
						aria-label="Select row"
						checked={row.getIsSelected()}
						onCheckedChange={(checked) => row.toggleSelected(!!checked)}
					/>
				</TableCell>
			)}
			{row.getVisibleCells().map((cell, cellIndex) => {
				const cellContent = flexRender(
					cell.column.columnDef.cell,
					cell.getContext(),
				);
				const cellStyle = flexibleTableColumns
					? {
							width: `${cell.column.getSize()}px`,
							maxWidth: `${cell.column.getSize()}px`,
							minWidth: `${cell.column.getSize()}px`,
						}
					: { width: `${cell.column.getSize()}px` };

				return (
					<TableCell
						className={cn(
							"px-2 h-4 text-t3",
							cellIndex === 0 && "pl-4 text-t2 font-medium",
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
									cellIndex === 0 && "pl-4",
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
		</>
	);
}

/** Memoized TableRowCells - prevents unnecessary re-renders during virtualization scrolling */
export const TableRowCells = memo(TableRowCellsInner, (prevProps, nextProps) => {
	// Custom comparator - only re-render if essential data changed
	// IMPORTANT: Check row.original identity to handle data changes with keepPreviousData
	return (
		prevProps.row.id === nextProps.row.id &&
		prevProps.row.original === nextProps.row.original &&
		prevProps.row.getIsSelected() === nextProps.row.getIsSelected() &&
		prevProps.rowHref === nextProps.rowHref &&
		prevProps.enableSelection === nextProps.enableSelection &&
		prevProps.flexibleTableColumns === nextProps.flexibleTableColumns
	);
}) as typeof TableRowCellsInner;

interface TableEmptyStateProps {
	numberOfColumns: number;
	isLoading?: boolean;
	emptyStateChildren?: ReactNode;
	emptyStateText?: string;
}

export function TableEmptyState({
	numberOfColumns,
	isLoading,
	emptyStateChildren,
	emptyStateText,
}: TableEmptyStateProps) {
	return (
		<ShadcnTableBody>
			<TableRow className="hover:bg-transparent dark:hover:bg-transparent">
				<TableCell className="h-10 text-center py-0" colSpan={numberOfColumns}>
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
