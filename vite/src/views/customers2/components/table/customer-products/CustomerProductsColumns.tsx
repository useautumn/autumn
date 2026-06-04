import { type FullCusProduct, isCustomerProductTrialing } from "@autumn/shared";
import { FlaskIcon, PencilIcon } from "@phosphor-icons/react";
import type { Row, Table } from "@tanstack/react-table";
import { ArrowRightLeft, Delete, RotateCcw, Send } from "lucide-react";
import { TableDropdownMenuCell } from "@/components/general/table/table-dropdown-menu-cell";
import {
	dateSkeleton,
	hiddenSkeleton,
	statusSkeleton,
} from "@/components/general/table/table-skeleton-presets";
import { DropdownMenuItem } from "@/components/v2/dropdowns/DropdownMenu";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { createDateTimeColumn } from "@/views/customers2/utils/ColumnHelpers";
import { AdminHover } from "../../../../../components/general/AdminHover";
import { getCusProductHoverTexts } from "../../../../admin/adminUtils";
import { CustomerProductPrice } from "./CustomerProductPrice";
import { CustomerProductsStatus } from "./CustomerProductsStatus";

function CustomerProductActionsCell({
	row,
	table,
}: {
	row: Row<FullCusProduct>;
	table: Table<FullCusProduct>;
}) {
	const { isAdmin } = useAdmin();
	const meta = table.options.meta as {
		onCancelClick?: (product: FullCusProduct) => void;
		onUpdateClick?: (product: FullCusProduct) => void;
		onUncancelClick?: (product: FullCusProduct) => void;
		onTransferClick?: (product: FullCusProduct) => void;
		onTestSheetClick?: (product: FullCusProduct) => void;
		onSendWebhookClick?: (product: FullCusProduct) => void;
		hasEntities?: boolean;
		sendingWebhookProductId?: string | null;
	};

	if (!meta?.onCancelClick) return null;

	const isCanceling = row.original.canceled;

	return (
		<div className="flex justify-end">
			<TableDropdownMenuCell>
				{meta.onTestSheetClick && (
					<DropdownMenuItem
						className="flex items-center gap-2 text-xs"
						onClick={(e) => {
							e.stopPropagation();
							meta.onTestSheetClick?.(row.original);
						}}
					>
						<FlaskIcon size={16} /> Test Sheet
					</DropdownMenuItem>
				)}
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
				{meta.onUpdateClick && (
					<DropdownMenuItem
						className="flex items-center gap-2 text-xs"
						onClick={(e) => {
							e.stopPropagation();
							meta.onUpdateClick?.(row.original);
						}}
					>
						<PencilIcon size={16} /> Update
					</DropdownMenuItem>
				)}
				{isAdmin && meta.onSendWebhookClick && (
					<DropdownMenuItem
						className="flex items-center gap-2 text-xs"
						disabled={meta.sendingWebhookProductId === row.original.id}
						onClick={(e) => {
							e.stopPropagation();
							meta.onSendWebhookClick?.(row.original);
						}}
					>
						<Send size={16} /> Send CP updated webhook
					</DropdownMenuItem>
				)}
				{isCanceling ? (
					<DropdownMenuItem
						className="flex items-center gap-2 text-xs"
						onClick={(e) => {
							e.stopPropagation();
							meta.onUncancelClick?.(row.original);
						}}
					>
						<RotateCcw size={16} /> Uncancel
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem
						className="flex items-center gap-2 text-xs text-red-500 dark:text-red-400"
						onClick={(e) => {
							e.stopPropagation();
							meta.onCancelClick?.(row.original);
						}}
					>
						<Delete size={16} /> Cancel
					</DropdownMenuItem>
				)}
			</TableDropdownMenuCell>
		</div>
	);
}

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
				<div className="font-medium text-foreground flex items-center gap-2 ">
					<AdminHover texts={getCusProductHoverTexts(row.original)}>
						{row.original.product.name}
					</AdminHover>
					{showQuantity && (
						<div className="text-tertiary-foreground bg-muted rounded-sm p-1 py-0">
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
		meta: { skeleton: statusSkeleton },
		cell: ({
			row,
			table,
		}: {
			row: Row<FullCusProduct>;
			table: Table<FullCusProduct>;
		}) => {
			const nowMs = (table.options.meta as { nowMs?: number })?.nowMs;

			return (
				<CustomerProductsStatus
					status={row.original.status}
					starts_at={row.original.starts_at ?? undefined}
					canceled={row.original.canceled}
					canceled_at={row.original.canceled_at ?? undefined}
					trialing={isCustomerProductTrialing(row.original, { nowMs }) || false}
					trial_ends_at={row.original.trial_ends_at ?? undefined}
					nowMs={nowMs}
				/>
			);
		},
	},
	createDateTimeColumn<FullCusProduct>({
		header: "Created At",
		accessorKey: "created_at",
		withYear: true,
	}),
	{
		id: "actions",
		header: "",
		size: 40,
		meta: { skeleton: hiddenSkeleton },
		cell: CustomerProductActionsCell,
	},
];
