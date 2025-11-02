import type { FullCusProduct } from "@autumn/shared";
import type { Row, Table } from "@tanstack/react-table";
import { Delete } from "lucide-react";
import { TableDropdownMenuCell } from "@/components/general/table/table-dropdown-menu-cell";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	createDateTimeColumn,
	createIdCopyColumn,
} from "@/views/customers2/utils/ColumnHelpers";
import { CustomerProductsStatus } from "./CustomerProductsStatus";

export const CustomerProductsColumns = [
	{
		header: "Name",
		accessorKey: "name",
		cell: ({ row }: { row: Row<FullCusProduct> }) => {
			return <div className="font-semibold">{row.original.product.name}</div>;
		},
	},
	createIdCopyColumn<FullCusProduct>({
		accessorKey: "id",
		displayKey: "product_id",
	}),
	{
		header: "Stauts",
		accessorKey: "status",
		cell: ({ row }: { row: Row<FullCusProduct> }) => {
			return <CustomerProductsStatus status={row.original.status} />;
		},
	},
	createDateTimeColumn<FullCusProduct>({
		header: "Created At",
		accessorKey: "created_at",
		className: "",
	}),
	{
		id: "actions",
		header: "",
		size: 50,
		cell: ({
			row,
			table,
		}: {
			row: Row<FullCusProduct>;
			table: Table<FullCusProduct>;
		}) => {
			const meta = table.options.meta as {
				onCancelClick?: (product: FullCusProduct) => void;
			};

			if (!meta?.onCancelClick) return null;

			return (
				<TableDropdownMenuCell>
					<DropdownMenuItem
						className="flex items-center gap-2 text-xs text-red-500 dark:text-red-400"
						onClick={() => meta.onCancelClick?.(row.original)}
					>
						<Delete size={16} /> Cancel
					</DropdownMenuItem>
				</TableDropdownMenuCell>
			);
		},
	},
];
