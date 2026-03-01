import type { ProductV2 } from "@autumn/shared";
import type { Row } from "@tanstack/react-table";
import { AdminHover } from "@/components/general/AdminHover";
import { PlanTypeBadges } from "@/components/v2/badges/PlanTypeBadges";
import { MiniCopyButton } from "@/components/v2/buttons/CopyButton";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { getPlanHoverTexts } from "@/views/admin/adminUtils";
import { ProductCountsTooltip } from "@/views/products/products/product-row-toolbar/ProductCountsTooltip";
import { ProductListRowToolbar } from "./ProductListRowToolbar";

export const createProductListColumns = ({
	showGroup = false,
	onDeleteClick,
}: {
	showGroup?: boolean;
	onDeleteClick?: (product: ProductV2) => void;
} = {}) => [
	{
		size: 300,
		header: "Name",
		accessorKey: "name",
		enableSorting: true,
		cell: ({ row }: { row: Row<ProductV2> }) => {
			return (
				<div className="font-medium text-t1 flex gap-1">
					<AdminHover texts={getPlanHoverTexts({ plan: row.original })}>
						{row.original.name}
					</AdminHover>
					<PlanTypeBadges
						product={row.original}
						iconOnly
						className="bg-transparent"
					/>
				</div>
			);
		},
	},
	{
		header: "ID",
		accessorKey: "id",
		enableSorting: false,
		cell: ({ row }: { row: Row<ProductV2> }) => {
			const product = row.original;
			return (
				<div className="font-mono justify-start flex w-full group overflow-hidden">
					{product.id ? (
						<MiniCopyButton text={product.id} />
					) : (
						<span className="px-1 text-t3">NULL</span>
					)}
				</div>
			);
		},
	},
	...(showGroup
		? [
				{
					header: "Group",
					accessorKey: "group",
					enableSorting: false,
					cell: ({ row }: { row: Row<ProductV2> }) => {
						return <div className="text-t2">{row.original.group || ""}</div>;
					},
				},
			]
		: []),
	{
		header: "Customers",
		accessorKey: "active_count",
		enableSorting: true,
		cell: ({ row }: { row: Row<ProductV2 & { active_count?: number }> }) => {
			return (
				<div className="text-t2">
					<ProductCountsTooltip product={row.original} />
				</div>
			);
		},
	},
	{
		header: "Created",
		accessorKey: "created_at",
		size: 100,
		enableSorting: true,
		cell: ({ row }: { row: Row<ProductV2> }) => {
			return (
				<div className="text-t4 text-xs ">
					{formatUnixToDateTime(row.original.created_at).date}
				</div>
			);
		},
	},
	{
		header: "",
		accessorKey: "actions",
		size: 40,
		enableSorting: false,
		cell: ({ row }: { row: Row<ProductV2> }) => {
			return (
				<div
					role="toolbar"
					className="flex justify-end w-full pr-2"
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
				>
					<ProductListRowToolbar
						product={row.original}
						onDeleteClick={onDeleteClick}
					/>
				</div>
			);
		},
	},
];
