import type { Feature } from "@autumn/shared";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { AdminHover } from "@/components/general/AdminHover";
import { MiniCopyButton } from "@/components/v2/buttons/CopyButton";
import { getFeatureHoverTexts } from "@/views/admin/adminUtils";
import { FeatureListRowToolbar } from "./FeatureListRowToolbar";

export const createCreditListColumns = (): ColumnDef<Feature, unknown>[] => [
	{
		size: 150,
		header: "Name",
		accessorKey: "name",
		cell: ({ row }: { row: Row<Feature> }) => {
			return (
				<div className="font-medium text-t1">
					<AdminHover texts={getFeatureHoverTexts({ feature: row.original })}>
						{row.original.name}
					</AdminHover>
				</div>
			);
		},
	},
	{
		header: "ID",
		size: 150,
		accessorKey: "id",
		cell: ({ row }: { row: Row<Feature> }) => {
			const feature = row.original;
			return (
				<div className="font-mono justify-start flex w-full group overflow-hidden">
					{feature.id ? (
						<MiniCopyButton text={feature.id} />
					) : (
						<span className="px-1 text-t3">NULL</span>
					)}
				</div>
			);
		},
	},
	{
		header: "Features",
		size: 250,
		accessorKey: "features",
		cell: ({ row }: { row: Row<Feature> }) => {
			const creditSystem = row.original;
			const featureIds =
				creditSystem.config?.schema
					?.map(
						(schema: { metered_feature_id: string }) =>
							schema.metered_feature_id,
					)
					.join(", ") || "—";
			return (
				<div className="text-t2 truncate font-mono text-xs">{featureIds}</div>
			);
		},
	},
	{
		header: "",
		accessorKey: "actions",
		size: 40,
		enableSorting: false,
		cell: ({ row }: { row: Row<Feature> }) => {
			return (
				<div
					className="flex justify-end w-full pr-2"
					onClick={(e) => e.stopPropagation()}
				>
					<FeatureListRowToolbar feature={row.original} />
				</div>
			);
		},
	},
];
