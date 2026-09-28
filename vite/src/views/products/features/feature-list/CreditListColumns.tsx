import {
	type Feature,
	type ModelsDevProvider,
	splitModelId,
} from "@autumn/shared";
import { MiniCopyButton } from "@autumn/ui";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { AdminHover } from "@/components/general/AdminHover";
import { getFeatureHoverTexts } from "@/views/admin/adminUtils";
import { FeatureTypeChip } from "../components/FeatureTypeChip";
import { CreditSystemFeatureChips } from "./CreditSystemFeatureChips";
import { FeatureListRowToolbar } from "./FeatureListRowToolbar";

function resolveModelName(
	fullId: string,
	providers: Record<string, ModelsDevProvider>,
): string {
	const { provider, modelKey } = splitModelId(fullId);
	if (!provider) return fullId;
	return providers[provider]?.models[modelKey]?.name ?? modelKey;
}

export const createCreditListColumns = ({
	providers,
	features,
}: {
	providers: Record<string, ModelsDevProvider>;
	features: Feature[];
}): ColumnDef<Feature, unknown>[] => [
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
		cell: ({ row }: { row: Row<Feature> }) => (
			<FeatureTypeChip featureType={row.original.type} />
		),
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
			const labels =
				modelMarkupEntries && modelMarkupEntries.length > 0
					? modelMarkupEntries.map(([fullId]) =>
							resolveModelName(fullId, providers),
						)
					: (creditSystem.config?.schema ?? []).map(
							({ metered_feature_id }: { metered_feature_id: string }) =>
								features.find((feature) => feature.id === metered_feature_id)
									?.name ?? metered_feature_id,
						);
			return <CreditSystemFeatureChips labels={labels} />;
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
