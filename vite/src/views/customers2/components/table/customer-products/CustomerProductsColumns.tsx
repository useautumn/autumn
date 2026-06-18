import { type FullCusProduct, isCustomerProductTrialing } from "@autumn/shared";
import { FlaskIcon, PencilIcon } from "@phosphor-icons/react";
import type { Row, Table } from "@tanstack/react-table";
import { ArrowRightLeft, Delete, RotateCcw } from "lucide-react";
import { TableDropdownMenuCell } from "@/components/general/table/table-dropdown-menu-cell";
import {
	hiddenSkeleton,
	nameWithIconSkeleton,
	statusSkeleton,
} from "@/components/general/table/table-skeleton-presets";
import { DropdownMenuItem } from "@/components/v2/dropdowns/DropdownMenu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { cn } from "@/lib/utils";
import { getCusProductKind, getPlanKindConfig } from "@/utils/planKind";
import { createDateTimeColumn } from "@/views/customers2/utils/ColumnHelpers";
import { AdminHover } from "../../../../../components/general/AdminHover";
import { getCusProductHoverTexts } from "../../../../admin/adminUtils";
import { CustomerProductPrice } from "./CustomerProductPrice";
import { CustomerProductsStatus } from "./CustomerProductsStatus";

export const CustomerProductsColumns = [
	{
		header: "Name",
		accessorKey: "name",
		size: 150,
		meta: { skeleton: nameWithIconSkeleton },
		cell: ({ row }: { row: Row<FullCusProduct> }) => {
			const quantity = row.original.quantity;
			const showQuantity = quantity && quantity > 1;
			const config = getPlanKindConfig(getCusProductKind(row.original));

			return (
				<div className="font-medium text-foreground flex items-center gap-2 ">
					<Tooltip delayDuration={0}>
						<TooltipTrigger asChild>
							<span className={cn("flex items-center", config.color)}>
								{config.icon}
							</span>
						</TooltipTrigger>
						<TooltipContent>{config.label}</TooltipContent>
					</Tooltip>
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
		size: 120,
		cell: ({ row }: { row: Row<FullCusProduct> }) => {
			return <CustomerProductPrice cusProduct={row.original} />;
		},
	},
	{
		header: "Status",
		accessorKey: "status",
		size: 110,
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
	{
		...createDateTimeColumn<FullCusProduct>({
			header: "Created At",
			accessorKey: "created_at",
			withYear: true,
		}),
		size: 150,
	},
	{
		id: "actions",
		header: "",
		size: 40,
		meta: { skeleton: hiddenSkeleton },
		cell: ({
			row,
			table,
		}: {
			row: Row<FullCusProduct>;
			table: Table<FullCusProduct>;
		}) => {
			const meta = table.options.meta as {
				onCancelClick?: (product: FullCusProduct) => void;
				onUpdateClick?: (product: FullCusProduct) => void;
				onUncancelClick?: (product: FullCusProduct) => void;
				onTransferClick?: (product: FullCusProduct) => void;
				onTestSheetClick?: (product: FullCusProduct) => void;
				hasEntities?: boolean;
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
		},
	},
];
