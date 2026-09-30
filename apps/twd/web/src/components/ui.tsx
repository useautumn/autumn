import { GroupedTabButton } from "@autumn/ui/components/general/grouped-tab-button";
import { Table } from "@autumn/ui/components/table";
import { TablePaginationFooter } from "@autumn/ui/components/table/table-pagination-footer";
import { Button } from "@autumn/ui/components/ui/button";
import { Checkbox as AutumnCheckbox } from "@autumn/ui/components/ui/checkbox";
import {
	Dialog as AutumnDialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui/components/ui/dialog";
import { Input } from "@autumn/ui/components/ui/input";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@autumn/ui/components/ui/sheet";
import {
	Tooltip as AutumnTooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui/components/ui/tooltip";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import {
	type ColumnDef,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import {
	type ComponentProps,
	type CSSProperties,
	type ReactElement,
	type ReactNode,
	useId,
	useState,
} from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/format.ts";

export { SectionTag } from "@autumn/ui/components/general/section-tag";
export { Button } from "@autumn/ui/components/ui/button";
export { Input } from "@autumn/ui/components/ui/input";
export { Skeleton } from "@autumn/ui/components/ui/skeleton";
export { TooltipProvider } from "@autumn/ui/components/ui/tooltip";

// ---- inputs ---------------------------------------------------------------

export const Field = ({
	label,
	hint,
	className,
	inputClassName,
	...props
}: ComponentProps<"input"> & {
	label: string;
	hint?: string;
	inputClassName?: string;
}) => {
	const id = useId();
	return (
		<div className={cn("flex flex-col gap-1.5", className)}>
			<label htmlFor={id} className="text-sm text-tertiary-foreground">
				{label} {hint && <span className="text-subtle">{hint}</span>}
			</label>
			<Input id={id} className={inputClassName} {...props} />
		</div>
	);
};

/** Autumn's list search bar (customers/products toolbar). */
export const SearchInput = ({
	value,
	onChange,
	placeholder,
	className,
	onKeyDown,
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	className?: string;
	onKeyDown?: ComponentProps<"input">["onKeyDown"];
}) => (
	<div
		className={cn(
			"flex h-input min-w-0 cursor-text items-center gap-1.5 rounded-lg py-0 pr-1 pl-2.5 input-base input-shadow-default input-state-focus-within",
			className,
		)}
	>
		<MagnifyingGlassIcon
			size={14}
			className="pointer-events-none shrink-0 text-tertiary-foreground"
		/>
		<Input
			variant="headless"
			value={value}
			onChange={(e) => onChange(e.target.value)}
			onKeyDown={onKeyDown}
			placeholder={placeholder}
			aria-label={placeholder}
			className="h-full min-w-0 flex-1 text-sm"
		/>
	</div>
);

export const Kbd = ({ children }: { children: ReactNode }) => (
	<kbd className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded border bg-muted px-1 font-mono text-[10px] text-tertiary-foreground">
		{children}
	</kbd>
);

export const Checkbox = ({
	checked,
	indeterminate,
	onCheckedChange,
	label,
}: {
	checked: boolean;
	indeterminate?: boolean;
	onCheckedChange: (checked: boolean) => void;
	label: string;
}) => (
	<AutumnCheckbox
		checked={checked || !!indeterminate}
		onCheckedChange={(value) => onCheckedChange(!checked && value)}
		aria-label={label}
		className={cn(indeterminate && !checked && "opacity-50")}
	/>
);

/** Compact single-choice filter: Autumn's grouped tab button. */
export const Segmented = <T extends string>({
	value,
	onChange,
	options,
	className,
}: {
	value: T;
	onChange: (value: T) => void;
	options: readonly { value: T; label: ReactNode }[];
	label?: string;
	className?: string;
}) => (
	<GroupedTabButton
		value={value}
		onValueChange={(v) => onChange(v as T)}
		options={[...options]}
		className={cn("w-fit", className)}
	/>
);

// ---- page chrome ----------------------------------------------------------

/** Autumn page header: filled icon + title in muted text, actions right. */
export const PageHeader = ({
	icon,
	title,
	children,
}: {
	icon: ReactNode;
	title: ReactNode;
	children?: ReactNode;
}) => (
	<Table.Toolbar>
		<Table.Heading>
			<span className="flex text-subtle">{icon}</span>
			{title}
		</Table.Heading>
		{children && <Table.Actions>{children}</Table.Actions>}
	</Table.Toolbar>
);

export const Panel = ({ className, ...props }: ComponentProps<"div">) => (
	<div
		className={cn("rounded-lg border bg-interactive-secondary", className)}
		{...props}
	/>
);

// ---- table ----------------------------------------------------------------

/** packages/ui Table (the customers/plans list) over a plain column list. */
export const DataTable = <T,>({
	data,
	columns,
	isLoading = false,
	emptyText,
	getRowHref,
	onRowClick,
	getRowClassName,
	rowClassName = "h-10",
	footer,
}: {
	data: T[] | undefined;
	// biome-ignore lint/suspicious/noExplicitAny: tanstack column values vary per column
	columns: ColumnDef<T, any>[];
	isLoading?: boolean;
	emptyText: string;
	getRowHref?: (row: T) => string;
	onRowClick?: (row: T) => void;
	getRowClassName?: (row: T) => string | undefined;
	rowClassName?: string;
	footer?: ReactNode;
}) => {
	const table = useReactTable({
		data: data ?? [],
		columns,
		getCoreRowModel: getCoreRowModel(),
	});
	return (
		<Table.Provider
			config={{
				table,
				numberOfColumns: columns.length,
				isLoading: isLoading && !data,
				skeletonRowCount: 3,
				getRowHref,
				onRowClick,
				getRowClassName,
				linkComponent: Link,
				emptyStateText: emptyText,
				rowClassName,
				mobileCards: true,
			}}
		>
			<div
				className="contents [&_table]:min-w-(--twd-table-min)"
				style={
					{ "--twd-table-min": `${table.getTotalSize()}px` } as CSSProperties
				}
			>
				<Table.Container>
					<Table.Content footer={footer}>
						<Table.Header />
						<Table.Body />
					</Table.Content>
				</Table.Container>
			</div>
		</Table.Provider>
	);
};

const PAGE_SIZES = [25, 50, 100, 200] as const;

/** DataTable with numbered pages over rows already in memory (live-patched lists); resets on resetKey. */
export const PagedDataTable = <T,>({
	data,
	resetKey,
	pageSizes = PAGE_SIZES,
	...props
}: ComponentProps<typeof DataTable<T>> & {
	resetKey: string;
	pageSizes?: readonly number[];
}) => {
	const rows = data ?? [];
	const [pageSize, setPageSize] = useState(pageSizes[1] ?? pageSizes[0] ?? 50);
	const [page, setPage] = useState({ resetKey, index: 0 });
	const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
	const index = Math.min(
		page.resetKey === resetKey ? page.index : 0,
		totalPages - 1,
	);
	const go = (next: number) => setPage({ resetKey, index: next });
	return (
		<DataTable
			{...props}
			data={data && rows.slice(index * pageSize, (index + 1) * pageSize)}
			footer={
				rows.length > Math.min(pageSize, pageSizes[0] ?? pageSize) && (
					<TablePaginationFooter
						currentPage={index + 1}
						totalPages={totalPages}
						totalCount={rows.length}
						canGoPrev={index > 0}
						canGoNext={index < totalPages - 1}
						onPrev={() => go(index - 1)}
						onNext={() => go(index + 1)}
						pageSize={pageSize}
						pageSizeOptions={pageSizes}
						onPageSizeChange={(size) => {
							setPageSize(size);
							go(0);
						}}
					/>
				)
			}
		/>
	);
};

// ---- tooltip --------------------------------------------------------------

export const Tooltip = ({
	content,
	children,
	side = "top",
}: {
	content: ReactNode;
	children: ReactElement;
	side?: "top" | "bottom" | "left" | "right";
}) => (
	<AutumnTooltip delayDuration={150}>
		<TooltipTrigger render={children} />
		<TooltipContent side={side} className="max-w-sm">
			{content}
		</TooltipContent>
	</AutumnTooltip>
);

// ---- dialogs --------------------------------------------------------------

export const Dialog = ({
	open,
	onOpenChange,
	title,
	description,
	children,
	footer,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: ReactNode;
	children?: ReactNode;
	footer?: ReactNode;
}) => (
	<AutumnDialog open={open} onOpenChange={onOpenChange}>
		<DialogContent>
			<DialogHeader>
				<DialogTitle className="text-sm">{title}</DialogTitle>
				{description && <DialogDescription>{description}</DialogDescription>}
			</DialogHeader>
			{children}
			{footer && <DialogFooter className="mt-1">{footer}</DialogFooter>}
		</DialogContent>
	</AutumnDialog>
);

export const ConfirmDialog = ({
	open,
	onOpenChange,
	title,
	children,
	confirmLabel,
	onConfirm,
	pending,
	destructive,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	children: ReactNode;
	confirmLabel: string;
	onConfirm: () => void;
	pending?: boolean;
	destructive?: boolean;
}) => (
	<Dialog
		open={open}
		onOpenChange={onOpenChange}
		title={title}
		description={<span className="block">{children}</span>}
		footer={
			<>
				<Button variant="secondary" onClick={() => onOpenChange(false)}>
					Cancel
				</Button>
				<Button
					variant={destructive ? "destructive" : "primary"}
					isLoading={pending}
					onClick={onConfirm}
				>
					{confirmLabel}
				</Button>
			</>
		}
	/>
);

export const Drawer = ({
	open,
	onOpenChange,
	title,
	subtitle,
	actions,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: ReactNode;
	subtitle?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
}) => (
	<Sheet open={open} onOpenChange={onOpenChange}>
		<SheetContent className="md:max-w-3xl">
			<SheetHeader className="border-b pr-10">
				<div className="flex min-w-0 items-center gap-2">
					<SheetTitle className="min-w-0 flex-1 truncate font-mono text-sm font-medium">
						{title}
					</SheetTitle>
					{actions}
				</div>
				{subtitle && (
					<div className="text-xs text-tertiary-foreground">{subtitle}</div>
				)}
			</SheetHeader>
			<div className="min-h-0 flex-1 overflow-auto">{children}</div>
		</SheetContent>
	</Sheet>
);
