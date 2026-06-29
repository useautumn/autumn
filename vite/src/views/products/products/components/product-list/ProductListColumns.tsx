import type { ProductV2 } from "@autumn/shared";
import { MiniCopyButton } from "@autumn/ui";
import { CaretRightIcon } from "@phosphor-icons/react";
import type { Row } from "@tanstack/react-table";
import { AdminHover } from "@/components/general/AdminHover";
import { PlanTypeBadges } from "@/components/v2/badges/PlanTypeBadges";
import { cn } from "@/lib/utils";
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
			const isVariant = row.depth > 0;
			const canExpand = row.getCanExpand();
			return (
				<div className="font-medium text-foreground flex items-center gap-1">
					{canExpand && (
						<button
							type="button"
							aria-label={row.getIsExpanded() ? "Collapse" : "Expand"}
							onMouseDown={(e) => {
								e.preventDefault();
								e.stopPropagation();
							}}
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								row.toggleExpanded();
							}}
							className="flex items-center justify-center size-5 -ml-1 rounded cursor-pointer text-tertiary-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
						>
							<CaretRightIcon
								size={12}
								className={cn(
									"transition-transform duration-150",
									row.getIsExpanded() && "rotate-90",
								)}
							/>
						</button>
					)}
					{isVariant && (
						<>
							{/* Spacer matches the chevron so the variant marker aligns
							    with the base plan's name. */}
							<span className="size-5 -ml-1 shrink-0" aria-hidden />
							<span className="text-tertiary-foreground pr-1">└</span>
						</>
					)}
					<AdminHover
						texts={getPlanHoverTexts({ plan: row.original })}
						side="right"
					>
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
						<span className="px-1 text-tertiary-foreground">NULL</span>
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
						return (
							<div className="text-muted-foreground">
								{row.original.group || ""}
							</div>
						);
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
				<div className="text-muted-foreground">
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
				<div className="text-subtle text-xs ">
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
					className="flex justify-end w-full pr-2"
					onClick={(e) => e.stopPropagation()}
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
