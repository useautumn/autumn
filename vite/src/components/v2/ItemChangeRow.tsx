import {
	type Feature,
	findFeatureById,
	type PlanItemChangeV0,
} from "@autumn/shared";
import { SubscriptionItemRow } from "@/components/forms/update-subscription-v2/components/SubscriptionItemRow";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { planItemV1ToProductItem } from "@/utils/product/productItemUtils/planItemV1ToProductItem";

export function ItemChangeRow({
	change,
	features: featureOverride,
}: {
	change: PlanItemChangeV0;
	features?: Feature[];
}) {
	const { features: orgFeatures = [] } = useFeaturesQuery();
	const productItem = planItemV1ToProductItem({
		item: change.item,
		features: featureOverride ?? orgFeatures,
	});

	if (!productItem) return null;
	const feature = featureOverride
		? findFeatureById({
				features: featureOverride,
				featureId: change.feature_id,
			})
		: undefined;

	if (change.action === "deleted") {
		return (
			<SubscriptionItemRow feature={feature} isDeleted item={productItem} />
		);
	}

	return (
		<SubscriptionItemRow
			feature={feature}
			isCreated
			item={productItem}
			readOnly
		/>
	);
}
