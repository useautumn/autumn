import type { Feature, PlanItemChangeV0 } from "@autumn/shared";
import { ItemChangeRow } from "@/components/v2/ItemChangeRow";
import { RateChangeList } from "@/components/v2/RateChangeList";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { itemChangeRateChanges } from "./itemChangeRateChanges";

export function ItemChangeList({
	features,
	itemChanges,
}: {
	features?: Feature[];
	itemChanges: PlanItemChangeV0[];
}) {
	const { features: orgFeatures = [] } = useFeaturesQuery();
	if (itemChanges.length === 0) return null;

	const created = itemChanges.filter((change) => change.action === "created");
	const deleted = itemChanges.filter((change) => change.action === "deleted");

	return (
		<div className="flex flex-col gap-0 text-sm">
			{created.map((change, index) => (
				<div
					className="flex flex-col gap-1"
					key={`created-${change.feature_id}-${index}`}
				>
					<ItemChangeRow change={change} features={features} />
					<RateChangeList
						changes={itemChangeRateChanges({
							change,
							itemChanges,
							features: features ?? orgFeatures,
						})}
					/>
				</div>
			))}
			{deleted.map((change, index) => (
				<ItemChangeRow
					change={change}
					features={features}
					key={`deleted-${change.feature_id}-${index}`}
				/>
			))}
		</div>
	);
}
