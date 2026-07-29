import {
	type Feature,
	isAiCreditSystem,
	type ModelsDevProvider,
	splitModelId,
} from "@autumn/shared";
import { MiniCopyButton } from "@autumn/ui";
import { CoinsIcon, CpuIcon } from "@phosphor-icons/react";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { AdminHover } from "@/components/general/AdminHover";
import { getFeatureHoverTexts } from "@/views/admin/adminUtils";
import { FeatureListRowToolbar } from "./FeatureListRowToolbar";

function resolveModelName(
	fullId: string,
	providers: Record<string, ModelsDevProvider>,
): string {
	const { provider, modelKey } = splitModelId(fullId);
	if (!provider) return fullId;
	return providers[provider]?.models[modelKey]?.name ?? fullId;
}

export const createCreditListColumns = (
	providers: Record<string, ModelsDevProvider>,
): ColumnDef<Feature, unknown>[] => [
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
		size: 160,
		accessorKey: "type",
		cell: ({ row }: { row: Row<Feature> }) => {
			const isAi = isAiCreditSystem(row.original.type);
			return (
				<div className="flex items-center gap-1.5 text-muted-foreground text-sm">
					{isAi ? (
						<>
							<CpuIcon size={14} weight="fill" className="text-yellow-500" />
							AI Credit System
						</>
					) : (
						<>
							<CoinsIcon size={14} weight="fill" className="text-pink-500" />
							Credit System
						</>
					)}
				</div>
			);
		},
	},
	{
		header: "Features",
		size: 200,
		accessorKey: "features",
		cell: ({ row }: { row: Row<Feature> }) => {
			const creditSystem = row.original;
			const modelMarkupEntries = creditSystem.model_markups
				? Object.entries(creditSystem.model_markups)
				: null;
			const featureIds =
				modelMarkupEntries && modelMarkupEntries.length > 0
					? modelMarkupEntries
							.map(([fullId]) => resolveModelName(fullId, providers))
							.join(", ")
					: creditSystem.config?.schema
							?.map(
								(schema: { metered_feature_id: string }) =>
									schema.metered_feature_id,
							)
							.join(", ") || "—";
			return (
				<div className="text-muted-foreground truncate font-mono text-xs">
					{featureIds}
				</div>
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
