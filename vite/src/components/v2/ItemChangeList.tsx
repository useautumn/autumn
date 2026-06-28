import type { PlanUpdatePreviewItemChange } from "@autumn/shared";
import { ItemChangeRow } from "@/components/v2/ItemChangeRow";

export function ItemChangeList({
	itemChanges,
}: {
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
					key={`created-${change.feature_id}-${index}`}
				/>
			))}
			{deleted.map((change, index) => (
				<ItemChangeRow
					change={change}
					key={`deleted-${change.feature_id}-${index}`}
				/>
			))}
		</div>
	);
}
