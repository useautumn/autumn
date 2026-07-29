import type { Feature, PlanUpdatePreviewItemChange } from "@autumn/shared";
import { ItemChangeRow } from "@/components/v2/ItemChangeRow";

export function ItemChangeList({
	features,
	itemChanges,
}: {
	features?: Feature[];
	itemChanges: PlanUpdatePreviewItemChange[];
}) {
	if (itemChanges.length === 0) return null;

	const created = itemChanges.filter((change) => change.action === "created");
	const deleted = itemChanges.filter((change) => change.action === "deleted");

	return (
		<div className="flex flex-col gap-0 text-sm">
			{created.map((change, index) => (
				<ItemChangeRow
					change={change}
					features={features}
					key={`created-${change.feature_id}-${index}`}
				/>
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
