import {
	type Feature,
	type PlanUpdatePreviewItemChange,
	type ProductItem,
	planItemV0ToProductItem,
	planItemV1ToV0,
	type SharedContext,
} from "@autumn/shared";
import { SubscriptionItemRow } from "@/components/forms/update-subscription-v2/components/SubscriptionItemRow";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";

function toProductItem({
	item,
	features,
}: {
	item: PlanUpdatePreviewItemChange["item"];
	features: Feature[];
}): ProductItem | null {
	const ctx = { features } as unknown as SharedContext;
	try {
		return planItemV0ToProductItem({
			ctx,
			planItem: planItemV1ToV0({ ctx, item }),
		});
	} catch {
		return null;
	}
}

export function ItemChangeRow({
	change,
	features: featureOverride,
}: {
	change: PlanUpdatePreviewItemChange;
	features?: Feature[];
}) {
	const { features: orgFeatures = [] } = useFeaturesQuery();
	const productItem = toProductItem({
		item: change.item,
		features: featureOverride ?? orgFeatures,
	});

	if (!productItem) return null;

	if (change.action === "deleted") {
		return <SubscriptionItemRow isDeleted item={productItem} />;
	}

	return <SubscriptionItemRow isCreated item={productItem} readOnly />;
}
