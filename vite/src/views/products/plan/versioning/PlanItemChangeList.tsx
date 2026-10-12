import type { PlanItemChangeV0 } from "@autumn/shared";
import { ItemChangeList } from "@/components/v2/ItemChangeList";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { RateCardChangeRow } from "./RateCardChangeRow";
import { splitRateCardItemChanges } from "./rateCardItemChanges";

/** Item changes with rate-card-only edits shown once, as a rate card change, instead of an added and removed pair. */
export function PlanItemChangeList({
	itemChanges,
}: {
	itemChanges: PlanItemChangeV0[];
}) {
	const { features } = useFeaturesQuery();
	const { rateCardChanges, otherChanges } = splitRateCardItemChanges({
		itemChanges,
		features,
	});

	return (
		<>
			{rateCardChanges.map((itemChange) => (
				<RateCardChangeRow
					key={`rate-card-${itemChange.change.feature_id}`}
					itemChange={itemChange}
					features={features}
				/>
			))}
			<ItemChangeList itemChanges={otherChanges} />
		</>
	);
}
