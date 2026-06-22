import {
	Checkbox,
	TableHeader as ShadcnTableHeader,
	TableHead,
	TableRow,
} from "@autumn/ui";
import { flexRender, type HeaderGroup } from "@tanstack/react-table";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTableContext } from "./table-context";

function SortIcon({ sortDirection }: { sortDirection: string | false }) {
	if (sortDirection === "asc") {
		return (
			<ChevronUpIcon
				aria-hidden="true"
				className="shrink-0 text-foreground"
				size={16}
			/>
		);
	}

	return (
		<ChevronDownIcon
			aria-hidden="true"
			className={cn(
				"shrink-0",
				sortDirection ? "text-foreground" : "opacity-30",
			)}
			size={16}
		/>
	);
}

function HeaderContent<T>({
	header,
}: {
	header: HeaderGroup<T>["headers"][number];
}) {
	const { enableSorting } = useTableContext();
	if (header.isPlaceholder) {
		return null;
	}

	if (!header.column.getCanSort()) {
		return (
			<span className="truncate w-full">
				{flexRender(header.column.columnDef.header, header.getContext())}
			</span>
		);
	}

	return (
		<button
			className={cn(
				"flex h-full select-none items-center gap-1",
				enableSorting && "cursor-pointer",
			)}
			onClick={
				enableSorting ? header.column.getToggleSortingHandler() : undefined
			}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					header.column.getToggleSortingHandler()?.(e);
				}
			}}
			type="button"
		>
			{flexRender(header.column.columnDef.header, header.getContext())}
			{enableSorting && (
				<SortIcon sortDirection={header.column.getIsSorted()} />
			)}
		</button>
	);
}

export function TableHeader({
	className,
	hideBorder,
}: {
	className?: string;
	hideBorder?: boolean;
}) {
	const {
		table,
		enableSelection,
		enableColumnVisibility,
		flexibleTableColumns,
	} = useTableContext();
	const headerGroups = table.getHeaderGroups();
	const rows = table.getRowModel().rows;

	return (
		<ShadcnTableHeader className={cn("sticky top-0 z-20 bg-card", className)}>
			{headerGroups.map((headerGroup) => (
				<TableRow
					className={cn(
						"bg-card text-subtle",
						!hideBorder && "border-b",
						!rows.length && "border-dashed",
					)}
					key={headerGroup.id}
				>
					{enableSelection && table && (
						<TableHead className="w-[50px]">
							<Checkbox
								aria-label="Select all rows"
								checked={table.getIsAllPageRowsSelected()}
								onCheckedChange={(checked) =>
									table.toggleAllPageRowsSelected(!!checked)
								}
							/>
						</TableHead>
					)}
					{headerGroup.headers.map((header, index, arr) => {
						const isLast = index === arr.length - 1;
						const headerStyle = flexibleTableColumns
							? {
									width: `${header.getSize()}px`,
									maxWidth: `${header.getSize()}px`,
								}
							: { width: `${header.getSize()}px` };
						return (
							<TableHead
								className={cn(
									"h-7 px-2 text-subtle text-tiny font-medium!",
									index === 0 && "pl-4",
									isLast && enableColumnVisibility && "pr-8",
								)}
								key={header.id}
								style={headerStyle}
							>
								<div className="flex items-center justify-between w-full">
									<HeaderContent header={header} />
								</div>
							</TableHead>
						);
					})}
				</TableRow>
			))}
		</ShadcnTableHeader>
	);
}
