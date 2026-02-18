import type { Feature, FeatureOptions, ProductItem } from "@autumn/shared";
import {
	buildEditsForItem,
	featureToOptions,
	UsageModel,
} from "@autumn/shared";
import { motion } from "motion/react";
import type { UseAttachForm } from "@/components/forms/attach-v2/hooks/useAttachForm";
import { SubscriptionItemRow } from "@/components/forms/update-subscription-v2/components/SubscriptionItemRow";
import { STAGGER_ITEM_LAYOUT } from "@/components/forms/update-subscription-v2/constants/animationConstants";
import type { UseUpdateSubscriptionForm } from "@/components/forms/update-subscription-v2/hooks/useUpdateSubscriptionForm";
import { LAYOUT_TRANSITION } from "@/components/v2/sheets/SharedSheetComponents";

export function PlanItemRow({
	item,
	index,
	originalItemsMap,
	originalItems,
	features,
	prepaidOptions,
	initialPrepaidOptions,
	existingOptions,
	form,
	hasCustomizations,
	useStagger,
}: {
	item: ProductItem;
	index: number;
	originalItemsMap: Map<string | null, ProductItem>;
	originalItems: ProductItem[] | undefined;
	features: Feature[];
	prepaidOptions: Record<string, number>;
	initialPrepaidOptions: Record<string, number>;
	existingOptions?: FeatureOptions[];
	form: UseUpdateSubscriptionForm | UseAttachForm;
	hasCustomizations: boolean;
	useStagger?: boolean;
}) {
	if (!item.feature_id) return null;

	const featureId = item.feature_id;
	const isPrepaid = item.usage_model === UsageModel.Prepaid;

	let currentPrepaidQuantity: number | undefined;
	if (isPrepaid) {
		currentPrepaidQuantity = prepaidOptions[featureId];
	} else if (existingOptions) {
		const featureForOptions = features?.find((f) => f.id === featureId);
		const prepaidOption = featureToOptions({
			feature: featureForOptions,
			options: existingOptions,
		});
		currentPrepaidQuantity = prepaidOption?.quantity;
	}

	const initialPrepaidQuantity = isPrepaid
		? initialPrepaidOptions[featureId]
		: undefined;

	const originalItem = originalItemsMap.get(featureId);

	const isCreated = !originalItem && originalItems && originalItems.length > 0;

	const edits = hasCustomizations
		? buildEditsForItem({
				updatedItem: item,
				originalItem,
				updatedPrepaidQuantity: currentPrepaidQuantity,
				originalPrepaidQuantity: initialPrepaidQuantity,
			})
		: [];

	return (
		<motion.div
			key={featureId || item.price_id || index}
			layout="position"
			variants={useStagger ? STAGGER_ITEM_LAYOUT : undefined}
			transition={{ layout: LAYOUT_TRANSITION }}
		>
			<SubscriptionItemRow
				item={item}
				edits={edits}
				prepaidQuantity={currentPrepaidQuantity}
				form={form}
				featureId={featureId}
				isCreated={isCreated}
			/>
		</motion.div>
	);
}
