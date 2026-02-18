import type { ProductItem } from "@autumn/shared";
import { motion } from "motion/react";
import { SubscriptionItemRow } from "@/components/forms/update-subscription-v2/components/SubscriptionItemRow";
import { STAGGER_ITEM_LAYOUT } from "@/components/forms/update-subscription-v2/constants/animationConstants";
import { LAYOUT_TRANSITION } from "@/components/v2/sheets/SharedSheetComponents";

export function DeletedItemRow({
	item,
	index,
	useStagger,
}: {
	item: ProductItem;
	index: number;
	useStagger?: boolean;
}) {
	return (
		<motion.div
			key={`deleted-${item.feature_id || index}`}
			layout="position"
			variants={useStagger ? STAGGER_ITEM_LAYOUT : undefined}
			transition={{ layout: LAYOUT_TRANSITION }}
		>
			<SubscriptionItemRow item={item} isDeleted />
		</motion.div>
	);
}
