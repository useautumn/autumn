import type { ProductItem } from "@autumn/shared";
import { motion } from "motion/react";
import { SubscriptionItemRow } from "@/components/forms/update-subscription-v2/components/SubscriptionItemRow";
import { LAYOUT_TRANSITION } from "@/components/v2/sheets/SharedSheetComponents";

export function DeletedItemRow({
	item,
	index,
}: {
	item: ProductItem;
	index: number;
}) {
	return (
		<motion.div
			key={`deleted-${item.feature_id || index}`}
			layout="position"
			transition={{ layout: LAYOUT_TRANSITION }}
		>
			<SubscriptionItemRow item={item} isDeleted />
		</motion.div>
	);
}
