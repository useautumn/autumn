import type { FullCusProduct } from "@autumn/shared";
import type { Row } from "@tanstack/react-table";
import { Delete } from "lucide-react";
import CopyButton from "@/components/general/CopyButton";
import { TableDropdownMenuCell } from "@/components/general/table/TableDropdownMenuCell";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatUnixToDateTimeString } from "@/utils/formatUtils/formatDateUtils";
import { CustomerProductsStatus } from "./CustomerProductsStatus";

export const CustomerProductsColumns = [
	{
		header: "Name",
		accessorKey: "name",
		cell: ({ row }: { row: Row<FullCusProduct> }) => {
			return <div className="font-semibold">{row.original.product.name}</div>;
		},
	},
	{
		header: "ID",
		accessorKey: "id",
		cell: ({ row }: { row: Row<FullCusProduct> }) => {
			return (
				<div className="font-mono">
					{row.original.id ? (
						<CopyButton
							text={row.original.id || ""}
							className="bg-transparent text-t3 border-none px-1 shadow-none max-w-full font-sans"
						>
							<span className="truncate">{row.original.product_id}</span>
						</CopyButton>
					) : (
						<span className="px-1 text-t3">NULL</span>
					)}
				</div>
			);
		},
	},
	{
		header: "Stauts",
		accessorKey: "status",
		cell: ({ row }: { row: Row<FullCusProduct> }) => {
			return <CustomerProductsStatus status={row.original.status} />;
		},
	},
	{
		header: "Created At",
		accessorKey: "created_at",
		cell: ({ row }: { row: Row<FullCusProduct> }) => {
			return <div>{formatUnixToDateTimeString(row.original.created_at)}</div>;
		},
	},
	{
		id: "actions",
		header: "",
		size: 50,
		cell: ({ row, table }: { row: Row<FullCusProduct>; table: any }) => {
			const meta = table.options.meta as {
				onCancelClick?: (product: FullCusProduct) => void;
			};

			if (!meta?.onCancelClick) return null;

			return (
				<TableDropdownMenuCell>
					<DropdownMenuItem
						className="flex items-center gap-2 text-xs text-red-500"
						onClick={() => meta.onCancelClick?.(row.original)}
					>
						<Delete size={16} /> Cancel
					</DropdownMenuItem>
				</TableDropdownMenuCell>
			);
		},
	},
];
