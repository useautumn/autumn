import type { Row } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { memo, type ReactNode } from "react";
import { Link } from "react-router";
import { Checkbox } from "@/components/v2/checkboxes/Checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
	TableBody as ShadcnTableBody,
	TableCell,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface TableRowCellsProps<T> {
	row: Row<T>;
	enableSelection?: boolean;
	flexibleTableColumns?: boolean;
	rowHref?: string;
	visibleColumnKey?: string;
	isExpanded?: boolean;
}

function TableRowCellsInner<T>({
	row,
	enableSelection,
	flexibleTableColumns,
	rowHref,
}: TableRowCellsProps<T>) {
	const visibleCells = row.getVisibleCells();

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
			{visibleCells.map((cell, cellIndex) => {
				const cellContent = flexRender(
					cell.column.columnDef.cell,
					cell.getContext(),
				);
				const cellStyle = flexibleTableColumns
					? {
							width: `${cell.column.getSize()}px`,
							maxWidth: `${cell.column.getSize()}px`,
						}
					: { width: `${cell.column.getSize()}px` };

				return (
					<TableCell
						className={cn(
							"px-2 h-4 text-tertiary-foreground",
							cellIndex === 0 && "pl-4 text-muted-foreground font-medium",
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

export const TableRowCells = memo(
	TableRowCellsInner,
	(prevProps, nextProps) => {
		return (
			prevProps.row.id === nextProps.row.id &&
			prevProps.row.original === nextProps.row.original &&
			prevProps.row.getIsSelected() === nextProps.row.getIsSelected() &&
			prevProps.isExpanded === nextProps.isExpanded &&
			prevProps.rowHref === nextProps.rowHref &&
			prevProps.enableSelection === nextProps.enableSelection &&
			prevProps.flexibleTableColumns === nextProps.flexibleTableColumns &&
			prevProps.visibleColumnKey === nextProps.visibleColumnKey
		);
	},
) as typeof TableRowCellsInner;

const SKELETON_WIDTHS = ["w-24", "w-20", "w-28", "w-16", "w-32", "w-20"];

export type ColumnSkeletonMeta = {
	skeleton?: ReactNode | ((rowIndex: number) => ReactNode);
	hidden?: boolean;
};

export function TableSkeletonRows({
	columns,
	rowCount = 12,
	rowClassName,
	flexibleTableColumns,
	asFragment = false,
}: {
	columns: { id: string; size: number; skeleton?: ColumnSkeletonMeta }[];
	rowCount?: number;
	rowClassName?: string;
	flexibleTableColumns?: boolean;
	asFragment?: boolean;
}) {
	const skeletonRows = Array.from({ length: rowCount }).map((_, rowIndex) => (
		<TableRow
			key={`skeleton-${rowIndex}`}
			className={cn(
				"h-12 hover:bg-transparent dark:hover:bg-transparent",
				rowClassName,
			)}
		>
			{columns.map((col, colIndex) => {
				const meta = col.skeleton;
				const cellStyle = flexibleTableColumns
					? { width: `${col.size}px`, maxWidth: `${col.size}px` }
					: { width: `${col.size}px` };

				if (meta?.hidden) {
					return (
						<TableCell
							key={`skeleton-${col.id}-${rowIndex}`}
							style={cellStyle}
						/>
					);
				}

				const widthClass =
					SKELETON_WIDTHS[
						(colIndex * 3 + rowIndex) % SKELETON_WIDTHS.length
					];

				const skeletonContent =
					typeof meta?.skeleton === "function"
						? meta.skeleton(rowIndex)
						: meta?.skeleton;

				return (
					<TableCell
						key={`skeleton-${col.id}-${rowIndex}`}
						className={cn("px-2", colIndex === 0 && "pl-4")}
						style={cellStyle}
					>
						{skeletonContent ?? (
							<Skeleton className={cn("h-3.5 rounded-sm", widthClass)} />
						)}
					</TableCell>
				);
			})}
		</TableRow>
	));

	if (asFragment) return <>{skeletonRows}</>;

	return (
		<ShadcnTableBody className="divide-y bg-interactive-secondary">
			{skeletonRows}
		</ShadcnTableBody>
	);
}

