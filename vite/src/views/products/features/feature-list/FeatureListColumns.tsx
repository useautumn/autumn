import type { Feature } from "@autumn/shared";
import { MiniCopyButton } from "@autumn/ui";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { AdminHover } from "@/components/general/AdminHover";
import { getFeatureHoverTexts } from "@/views/admin/adminUtils";
import { getFeatureIcon, getFeatureIconConfig } from "../utils/getFeatureIcon";
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
			return (
				<div className="font-medium text-foreground">
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
						<span className="px-1 text-tertiary-foreground">NULL</span>
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
			const feature = row.original;
			const config = getFeatureIconConfig(
				feature.type,
				feature.config?.usage_type,
			);
			return (
				<div className="flex items-center gap-2 text-muted-foreground">
					{getFeatureIcon({ feature })}
					<span className="text-xs text-tertiary-foreground">
						{config.label}
					</span>
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
						return (
							<div className="text-muted-foreground truncate">{eventNames}</div>
						);
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
