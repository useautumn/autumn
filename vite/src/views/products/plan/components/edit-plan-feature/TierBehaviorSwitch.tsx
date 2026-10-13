import { getFeatureName, TierBehavior } from "@autumn/shared";
import { FormLabel, GroupedTabButton } from "@autumn/ui";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { itemToTierBehavior } from "../../utils/tierUtils";

const TIER_BEHAVIOR_OPTIONS = [
	{ value: TierBehavior.VolumeBased, label: "Volume" },
	{ value: TierBehavior.Graduated, label: "Graduated" },
];

export function TierBehaviorSwitch() {
	const { item, setItem } = useProductItemContext();
	const { features } = useFeaturesQuery();
	if (!item) return null;

	const tierBehavior = item.tier_behavior ?? TierBehavior.Graduated;
	const unitName = getFeatureName({
		feature: features.find((feature) => feature.id === item.feature_id),
		plural: false,
		capitalize: false,
	});
	const explanation =
		tierBehavior === TierBehavior.VolumeBased
			? `Usage up to the included amount is free. Past it, one tier is picked from total usage and every ${unitName} is charged at that tier's rate, plus its flat fee.`
			: `Each tier charges the usage that falls inside it, and the tiers add up.`;

	return (
		<div className="flex flex-col gap-1.5">
			<FormLabel className="mb-0">Tier pricing</FormLabel>
			<GroupedTabButton
				value={tierBehavior}
				options={TIER_BEHAVIOR_OPTIONS}
				onValueChange={(value) =>
					setItem(
						itemToTierBehavior({ item, tierBehavior: value as TierBehavior }),
					)
				}
			/>
			<p className="text-tertiary-foreground text-xs">{explanation}</p>
		</div>
	);
}
