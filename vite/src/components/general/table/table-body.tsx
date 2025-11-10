import { flexRender } from "@tanstack/react-table";
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
	const { table, numberOfColumns, enableSelection, isLoading, onRowClick } =
		useTableContext();
	const rows = table.getRowModel().rows;

	if (!rows.length) {
		return (
			<ShadcnTableBody>
				<TableRow>
					<TableCell className="h-16 text-center" colSpan={numberOfColumns}>
						{isLoading ? (
							<div className="flex justify-center items-center">
								<SmallSpinner />
							</div>
						) : (
							"No results"
						)}
					</TableCell>
				</TableRow>
			</ShadcnTableBody>
		);
	}

	return (
		<ShadcnTableBody className="divide-y divide-border-table">
			{rows.map((row) => (
				<TableRow
					className={cn("h-16 py-4 hover:bg-muted/50 text-t3")}
					data-state={row.getIsSelected() && "selected"}
					key={row.id}
					onClick={() => onRowClick?.(row.original)}
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
					{row.getVisibleCells().map((cell, index) => (
						<TableCell
							className={cn(
								"px-2 h-4 text-t3",
								index === 0 && "pl-4 text-t2 font-semibold",
							)}
							key={cell.id}
						>
							{flexRender(cell.column.columnDef.cell, cell.getContext())}
						</TableCell>
					))}
				</TableRow>
			))}
		</ShadcnTableBody>
	);
}
