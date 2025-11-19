import type { Feature } from "@autumn/shared";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { FeatureListRowToolbar } from "./FeatureListRowToolbar";

export const createCreditListColumns = (): ColumnDef<Feature, unknown>[] => [
	{
		size: 150,
		header: "Name",
		accessorKey: "name",
		cell: ({ row }: { row: Row<Feature> }) => {
			return <div className="font-medium text-t1">{row.original.name}</div>;
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
						<CopyButton
							text={feature.id}
							size="mini"
							className="w-fit bg-transparent justify-end px-0! border-none shadow-none hover:text-primary [&_svg]:opacity-0 group-hover:[&_svg]:opacity-100 max-w-full"
						/>
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
