import type { Feature, PlanItemChangeV0 } from "@autumn/shared";
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

	if (change.action === "deleted") {
		return <SubscriptionItemRow isDeleted item={productItem} />;
	}

	return <SubscriptionItemRow isCreated item={productItem} readOnly />;
}
