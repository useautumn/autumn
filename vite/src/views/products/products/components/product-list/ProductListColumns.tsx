import type { ProductV2 } from "@autumn/shared";
import { MiniCopyButton, Skeleton } from "@autumn/ui";
import type { Row } from "@tanstack/react-table";
import type { SandboxSummary } from "@/hooks/queries/useSandboxesQuery";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { ProductCountsTooltip } from "@/views/products/products/product-row-toolbar/ProductCountsTooltip";
import { ProductListRowToolbar } from "./ProductListRowToolbar";
import { ProductNameCell } from "./ProductNameCell";

export const createProductListColumns = ({
	showGroup = false,
	isCountsLoading = false,
	onDeleteClick,
	sandboxes = [],
}: {
	showGroup?: boolean;
	isCountsLoading?: boolean;
	onDeleteClick?: (product: ProductV2) => void;
	sandboxes?: SandboxSummary[];
} = {}) => [
	{
		size: 300,
		header: "Name",
		accessorKey: "name",
		enableSorting: true,
		cell: ({ row }: { row: Row<ProductV2> }) => <ProductNameCell row={row} />,
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
					{isCountsLoading ? (
						<Skeleton aria-label="Loading" className="h-4 w-14" />
					) : (
						<ProductCountsTooltip product={row.original} />
					)}
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
						sandboxes={sandboxes}
					/>
				</div>
			);
		},
	},
];
