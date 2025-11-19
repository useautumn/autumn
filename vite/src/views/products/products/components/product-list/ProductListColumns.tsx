import type { ProductV2 } from "@autumn/shared";
import type { Row } from "@tanstack/react-table";
import { PlanTypeBadges } from "@/components/v2/badges/PlanTypeBadges";
import { MiniCopyButton } from "@/components/v2/buttons/CopyButton";
import { ProductListRowToolbar } from "./ProductListRowToolbar";

export const createProductListColumns = ({
	showGroup = false,
}: {
	showGroup?: boolean;
} = {}) => [
	{
		size: 150,
		header: "Name",
		accessorKey: "name",
		cell: ({ row }: { row: Row<ProductV2> }) => {
			return <div className="font-medium text-t1">{row.original.name}</div>;
		},
	},
	{
		header: "ID",
		size: 150,
		accessorKey: "id",
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
					cell: ({ row }: { row: Row<ProductV2> }) => {
						return <div className="text-t2">{row.original.group || "—"}</div>;
					},
				},
			]
		: []),
	{
		header: "Customers",
		size: 50,
		accessorKey: "active_count",
		cell: ({ row }: { row: Row<ProductV2 & { active_count?: number }> }) => {
			// This will be populated from counts data
			return <div className="text-t2">{row.original.active_count || 0}</div>;
		},
	},
	{
		header: "",
		size: 130,
		accessorKey: "badges",
		enableSorting: false,
		cell: ({ row }: { row: Row<ProductV2> }) => {
			return (
				<div className="flex justify-end">
					<PlanTypeBadges product={row.original} />
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
					<ProductListRowToolbar product={row.original} />
				</div>
			);
		},
	},
];
