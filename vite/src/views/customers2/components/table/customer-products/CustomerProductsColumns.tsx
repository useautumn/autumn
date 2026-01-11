import { type FullCusProduct, isCustomerProductTrialing } from "@autumn/shared";
import type { Row, Table } from "@tanstack/react-table";
import { ArrowRightLeft, Delete } from "lucide-react";
import { TableDropdownMenuCell } from "@/components/general/table/table-dropdown-menu-cell";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { createDateTimeColumn } from "@/views/customers2/utils/ColumnHelpers";
import { AdminHover } from "../../../../../components/general/AdminHover";
import { getCusProductHoverTexts } from "../../../../admin/adminUtils";
import { CustomerProductPrice } from "./CustomerProductPrice";
import { CustomerProductsStatus } from "./CustomerProductsStatus";

export const CustomerProductsColumns = [
	{
		header: "Name",
		accessorKey: "name",
		minSize: 10,
		maxSize: 200,
		cell: ({ row }: { row: Row<FullCusProduct> }) => {
			const quantity = row.original.quantity;
			const showQuantity = quantity && quantity > 1;

			return (
				<div className="font-medium text-t1 flex items-center gap-2 ">
					<AdminHover texts={getCusProductHoverTexts(row.original)}>
						{row.original.product.name}
					</AdminHover>
					{showQuantity && (
						<div className="text-t3 bg-muted rounded-sm p-1 py-0">
							{quantity}
						</div>
					)}
				</div>
			);
		},
	},
	{
		header: "Price",
		accessorKey: "price",
		cell: ({ row }: { row: Row<FullCusProduct> }) => {
			return <CustomerProductPrice cusProduct={row.original} />;
		},
	},
	{
		header: "Status",
		accessorKey: "status",
		cell: ({ row }: { row: Row<FullCusProduct> }) => {
			return (
				<CustomerProductsStatus
					status={row.original.status}
					starts_at={row.original.starts_at ?? undefined}
					canceled={row.original.canceled}
					trialing={isCustomerProductTrialing(row.original) || false}
					trial_ends_at={row.original.trial_ends_at ?? undefined}
				/>
			);
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
				onTransferClick?: (product: FullCusProduct) => void;
				hasEntities?: boolean;
			};

			if (!meta?.onCancelClick) return null;

			return (
				<TableDropdownMenuCell>
					{meta.hasEntities && meta.onTransferClick && (
						<DropdownMenuItem
							className="flex items-center gap-2 text-xs"
							onClick={(e) => {
								e.stopPropagation();
								meta.onTransferClick?.(row.original);
							}}
						>
							<ArrowRightLeft size={16} /> Transfer
						</DropdownMenuItem>
					)}
					<DropdownMenuItem
						className="flex items-center gap-2 text-xs text-red-500 dark:text-red-400"
						onClick={(e) => {
							e.stopPropagation();
							meta.onCancelClick?.(row.original);
						}}
					>
						<Delete size={16} /> Cancel
					</DropdownMenuItem>
				</TableDropdownMenuCell>
			);
		},
	},
];
