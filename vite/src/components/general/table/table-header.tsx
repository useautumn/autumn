import { flexRender, type HeaderGroup } from "@tanstack/react-table";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
	TableHeader as ShadcnTableHeader,
	TableHead,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useTableContext } from "./table-context";

function SortIcon({ sortDirection }: { sortDirection: string | false }) {
	if (!sortDirection) {
		return null;
	}

	return sortDirection === "asc" ? (
		<ChevronUpIcon
			aria-hidden="true"
			className="shrink-0 opacity-60"
			size={16}
		/>
	) : (
		<ChevronDownIcon
			aria-hidden="true"
			className="shrink-0 opacity-60"
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
		return flexRender(header.column.columnDef.header, header.getContext());
	}

	return (
		<button
			className={cn(
				"flex h-full w-full cursor-pointer select-none items-center justify-between gap-2",
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

export function TableHeader({ className }: { className?: string }) {
	const {
		table,
		enableSelection,
		enableColumnVisibility,
		flexibleTableColumns,
	} = useTableContext();
	const headerGroups = table.getHeaderGroups();
	return (
		<ShadcnTableHeader className={className}>
			{headerGroups.map((headerGroup) => (
				<TableRow
					className="border-b bg-card pointer-events-none text-t4 sticky top-0 z-20"
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
						return (
							<TableHead
								className={cn(
									"h-7 px-2 text-t4 text-tiny font-medium!",
									index === 0 && "pl-4",
									isLast && enableColumnVisibility && "pr-8",
								)}
								key={header.id}
								style={
									flexibleTableColumns
										? {
												width: `${header.getSize()}px`,
												maxWidth: `${header.getSize()}px`,
												minWidth: header.column.columnDef.minSize
													? `${header.column.columnDef.minSize}px`
													: undefined,
											}
										: { width: `${header.getSize()}px` }
								}
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
