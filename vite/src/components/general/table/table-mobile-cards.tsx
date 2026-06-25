import type { Cell, Row } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { useNavigate } from "react-router";
import { Skeleton } from "@autumn/ui";
import { cn } from "@/lib/utils";
import { useTableContext } from "./table-context";

const SKELETON_CARD_COUNT = 3;

const CONTROL_COLUMNS = new Set(["actions", "select"]);
const NON_TITLE_COLUMNS = new Set(["actions", "select", "scope"]);

export function TableMobileCards() {
	const {
		table,
		isLoading,
		isTransitioning,
		getRowHref,
		onRowClick,
		emptyStateChildren,
		emptyStateText,
		selectedItemId,
	} = useTableContext();

	const rows = table.getRowModel().rows;
	const showSkeleton = isLoading || isTransitioning;

	if (showSkeleton && !rows.length) {
		return (
			<div className="flex flex-col gap-2.5">
				{Array.from({ length: SKELETON_CARD_COUNT }).map((_, cardIndex) => (
					<div
						key={`skeleton-card-${cardIndex}`}
						className="rounded-xl border bg-interactive-secondary p-4 flex flex-col gap-3"
					>
						<Skeleton className="h-4 w-28 rounded-sm" />
						<div className="flex flex-col gap-2">
							<Skeleton className="h-3 w-40 rounded-sm" />
							<Skeleton className="h-3 w-32 rounded-sm" />
						</div>
					</div>
				))}
			</div>
		);
	}

	if (!rows.length) {
		return (
			<div className="rounded-xl border border-dashed bg-interactive-secondary dark:bg-transparent p-6 text-center text-subtle text-xs">
				{emptyStateChildren || emptyStateText}
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2.5">
			{rows.map((row) => (
				<MobileCard
					key={row.id}
					row={row}
					rowHref={getRowHref?.(row.original)}
					isSelected={selectedItemId === (row.original as { id?: string }).id}
					onRowClick={onRowClick}
				/>
			))}
		</div>
	);
}

function MobileCard<T>({
	row,
	rowHref,
	isSelected,
	onRowClick,
}: {
	row: Row<T>;
	rowHref?: string;
	isSelected: boolean;
	onRowClick?: (row: T) => void;
}) {
	const cells = row.getVisibleCells();
	const titleCell = cells.find(
		(cell) => !NON_TITLE_COLUMNS.has(cell.column.id),
	);
	const actionsCell = cells.find((cell) => cell.column.id === "actions");
	const detailCells = cells.filter(
		(cell) =>
			cell.column.id !== titleCell?.column.id &&
			!CONTROL_COLUMNS.has(cell.column.id) &&
			cell.column.columnDef.meta?.mobileCard !== "hidden",
	);

	const navigate = useNavigate();

	// Navigate programmatically rather than wrapping the card in a Link so nested
	// action controls (e.g. the actions dropdown) can stopPropagation and not
	// trigger navigation. Matches onRowClick behavior.
	const getClickHandler = () => {
		if (rowHref) return () => navigate(rowHref);
		if (onRowClick) return () => onRowClick(row.original);
		return undefined;
	};
	const handleClick = getClickHandler();

	return (
		<div
			className={cn(
				"rounded-xl border bg-interactive-secondary p-4 flex flex-col gap-3 transition-colors",
				isSelected ? "border-primary" : "active:bg-interactive-secondary-hover",
				handleClick && "cursor-pointer",
			)}
			onClick={handleClick}
			onKeyDown={
				handleClick
					? (e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								handleClick();
							}
						}
					: undefined
			}
			role={handleClick ? "button" : undefined}
			tabIndex={handleClick ? 0 : undefined}
		>
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0 flex-1 text-foreground font-medium text-[15px] truncate">
					{titleCell &&
						flexRender(titleCell.column.columnDef.cell, titleCell.getContext())}
				</div>
				{actionsCell && (
					<div className="shrink-0 -mr-1.5 -my-1">
						{flexRender(
							actionsCell.column.columnDef.cell,
							actionsCell.getContext(),
						)}
					</div>
				)}
			</div>

			{detailCells.length > 0 && (
				<dl className="flex flex-col gap-1.5 border-t border-border/60 pt-3">
					{detailCells.map((cell) => (
						<CardDetailRow key={cell.id} cell={cell} />
					))}
				</dl>
			)}
		</div>
	);
}

function CardDetailRow<T>({ cell }: { cell: Cell<T, unknown> }) {
	const { header, meta } = cell.column.columnDef;
	const cellContent = meta?.mobileCardCell
		? meta.mobileCardCell(cell.row)
		: flexRender(cell.column.columnDef.cell, cell.getContext());

	if (meta?.mobileCard === "full") {
		return <div className="text-sm text-foreground">{cellContent}</div>;
	}

	return (
		<div className="flex items-baseline justify-between gap-4 text-sm">
			<dt className="text-tertiary-foreground shrink-0">
				{typeof header === "string" ? header : null}
			</dt>
			<dd className="text-foreground text-right min-w-0 truncate">
				{cellContent}
			</dd>
		</div>
	);
}
