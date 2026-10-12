import type { Feature, PlanItemChangeV0 } from "@autumn/shared";
import { SubscriptionItemRow } from "@/components/forms/update-subscription-v2/components/SubscriptionItemRow";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { planItemV1ToProductItem } from "@/utils/product/productItemUtils/planItemV1ToProductItem";
import { ItemRateChangeRow } from "./ItemRateChangeRow";
import type { ItemRateRow } from "./pairItemRateRows";

export function ItemChangeRow({
	change,
	features: featureOverride,
	rateRow,
	className,
}: {
	change: PlanItemChangeV0;
	features?: Feature[];
	rateRow?: Pick<ItemRateRow, "changes" | "updated">;
	className?: string;
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

	if (!rateRow?.updated && !rateRow?.changes.length) {
		return <SubscriptionItemRow isCreated item={productItem} readOnly />;
	}

	return (
		<ItemRateChangeRow
			changes={rateRow.changes}
			className={className}
			updated={rateRow.updated}
		>
			<SubscriptionItemRow
				isCreated={!rateRow.updated}
				item={productItem}
				readOnly
			/>
		</ItemRateChangeRow>
	);
}
