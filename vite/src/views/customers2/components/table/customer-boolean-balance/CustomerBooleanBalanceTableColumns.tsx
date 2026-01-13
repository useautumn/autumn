import type { FullCusEntWithOptionalProduct } from "@autumn/shared";
import type { Row } from "@tanstack/react-table";
import { CustomerFeatureConfiguration } from "../customer-feature-usage/CustomerFeatureConfiguration";

export const CustomerBooleanBalanceTableColumns = ({
	aggregatedMap,
}: {
	aggregatedMap: Map<string, FullCusEntWithOptionalProduct[]>;
}) => [
	{
		header: "Feature",
		size: 200,
		accessorKey: "feature",
		cell: ({ row }: { row: Row<FullCusEntWithOptionalProduct> }) => {
			const ent = row.original;
			const featureId = ent.entitlement.feature.id;
			const originalEnts = aggregatedMap.get(featureId);
			const isAggregated = originalEnts && originalEnts.length > 1;
			const balanceCount = originalEnts?.length || 1;

			return (
				<div className="flex items-center gap-2">
					<span className="font-medium text-t1">
						{ent.entitlement.feature.name}
					</span>
					{isAggregated && (
						<div className="text-t3 bg-muted rounded-sm p-1 py-0">
							{balanceCount}
						</div>
					)}
				</div>
			);
		},
	},
	{
		header: "Type",
		size: 200,
		accessorKey: "type",
		cell: ({ row }: { row: Row<FullCusEntWithOptionalProduct> }) => {
			const ent = row.original;

			return (
				<div className="flex justify-center w-full">
					<CustomerFeatureConfiguration feature={ent.entitlement.feature} />
				</div>
			);
		},
	},
];
