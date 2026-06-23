import {
	type TableLinkComponent,
	useTableContext,
} from "@autumn/ui/components/table/table-context";
import { Skeleton } from "@autumn/ui/components/ui/skeleton";
import { cn } from "@autumn/ui/lib/utils";
import type { Cell, Row } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";

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
		linkComponent,
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
					isSelected={selectedItemId === (row.original as { id?: string }).id}
					linkComponent={linkComponent}
					onRowClick={onRowClick}
					row={row}
					rowHref={getRowHref?.(row.original)}
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
	linkComponent: LinkComponent,
}: {
	row: Row<T>;
	rowHref?: string;
	isSelected: boolean;
	onRowClick?: (row: T) => void;
	linkComponent?: TableLinkComponent;
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

	const interactive = Boolean(rowHref || onRowClick);
	const cardClassName = cn(
		"rounded-xl border bg-interactive-secondary p-4 flex flex-col gap-3 transition-colors",
		isSelected ? "border-primary" : "active:bg-interactive-secondary-hover",
		interactive && "cursor-pointer",
	);

	const content = (
		<>
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
						<CardDetailRow cell={cell} key={cell.id} />
					))}
				</dl>
			)}
		</>
	);

	// Nested action controls stopPropagation, so wrapping the whole card in a link
	// is safe and keeps the table router-agnostic via the injected linkComponent.
	if (rowHref && LinkComponent) {
		return (
			<LinkComponent className={cardClassName} to={rowHref}>
				{content}
			</LinkComponent>
		);
	}
	if (rowHref) {
		return (
			<a className={cardClassName} href={rowHref}>
				{content}
			</a>
		);
	}
	if (onRowClick) {
		return (
			<button
				className={cn(cardClassName, "text-left")}
				onClick={() => onRowClick(row.original)}
				type="button"
			>
				{content}
			</button>
		);
	}
	return <div className={cardClassName}>{content}</div>;
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
