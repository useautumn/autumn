import type { PlanUpdatePreviewItemChange } from "@autumn/shared";
import { SubscriptionItemRow } from "@/components/forms/update-subscription-v2/components/SubscriptionItemRow";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { planItemV1ToProductItem } from "@/utils/product/productItemUtils/planItemV1ToProductItem";

export function ItemChangeRow({
	change,
}: {
	change: PlanUpdatePreviewItemChange;
}) {
	const { features = [] } = useFeaturesQuery();
	const productItem = planItemV1ToProductItem({ item: change.item, features });

	if (!productItem) return null;

	if (change.action === "deleted") {
		return <SubscriptionItemRow isDeleted item={productItem} />;
	}

	return <SubscriptionItemRow isCreated item={productItem} readOnly />;
}
