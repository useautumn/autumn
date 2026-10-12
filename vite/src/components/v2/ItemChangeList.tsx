import type { Feature, PlanItemChangeV0 } from "@autumn/shared";
import { ItemChangeRow } from "@/components/v2/ItemChangeRow";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { itemChangeRateRows } from "./itemChangeRateChanges";

export function ItemChangeList({
	features,
	itemChanges,
}: {
	features?: Feature[];
	itemChanges: PlanItemChangeV0[];
}) {
	const { features: orgFeatures = [] } = useFeaturesQuery();
	if (itemChanges.length === 0) return null;

	const { created, deleted, rows, mergedRemoveIndices } = itemChangeRateRows({
		itemChanges,
		features: features ?? orgFeatures,
	});

	return (
		<div className="flex flex-col gap-0 text-sm">
			{rows.map((row) => (
				<ItemChangeRow
					change={created[row.addIndex]}
					features={features}
					key={`created-${created[row.addIndex].feature_id}-${row.addIndex}`}
					className="my-1"
					rateRow={row}
				/>
			))}
			{deleted.map(
				(change, index) =>
					!mergedRemoveIndices.has(index) && (
						<ItemChangeRow
							change={change}
							features={features}
							key={`deleted-${change.feature_id}-${index}`}
						/>
					),
			)}
		</div>
	);
}
