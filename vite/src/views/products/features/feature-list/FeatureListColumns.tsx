import type { Feature } from "@autumn/shared";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { MiniCopyButton } from "@/components/v2/buttons/CopyButton";
import { getFeatureIcon } from "../utils/getFeatureIcon";
import { FeatureListRowToolbar } from "./FeatureListRowToolbar";

export const createFeatureListColumns = ({
	showEventNames = false,
}: {
	showEventNames?: boolean;
} = {}): ColumnDef<Feature, unknown>[] => [
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
						<MiniCopyButton text={feature.id} />
					) : (
						<span className="px-1 text-t3">NULL</span>
					)}
				</div>
			);
		},
	},
	{
		header: "Type",
		size: 120,
		accessorKey: "type",
		cell: ({ row }: { row: Row<Feature> }) => {
			return (
				<div className="flex justify-start text-primary">
					{getFeatureIcon({ feature: row.original })}
				</div>
			);
		},
	},
	...(showEventNames
		? [
				{
					header: "Event Names",
					size: 200,
					accessorKey: "event_names",
					cell: ({ row }: { row: Row<Feature> }) => {
						const feature = row.original;
						const eventNames =
							feature.event_names && feature.event_names.length > 0
								? feature.event_names.join(", ")
								: "—";
						return <div className="text-t2 truncate">{eventNames}</div>;
					},
				},
			]
		: []),
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
