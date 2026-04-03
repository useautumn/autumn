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

export function getPlanItemPrepaidQuantity({
	featureId,
	prepaidOptions,
	initialPrepaidOptions,
	existingOptions,
	features,
}: {
	featureId: string;
	prepaidOptions: Record<string, number>;
	initialPrepaidOptions: Record<string, number>;
	existingOptions?: FeatureOptions[];
	features: Feature[];
}) {
	const formQuantity = prepaidOptions[featureId];
	if (formQuantity !== undefined) return formQuantity;

	const initialQuantity = initialPrepaidOptions[featureId];
	if (initialQuantity !== undefined) return initialQuantity;

	if (!existingOptions) return undefined;

	const featureForOptions = features?.find((f) => f.id === featureId);
	if (!featureForOptions) return undefined;

	const prepaidOption = featureToOptions({
		feature: featureForOptions,
		options: existingOptions,
	});

	return prepaidOption?.quantity;
}

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
	readOnly,
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
	readOnly?: boolean;
	useStagger?: boolean;
}) {
	if (!item.feature_id) return null;

	const featureId = item.feature_id;
	const isPrepaid = item.usage_model === UsageModel.Prepaid;

	const currentPrepaidQuantity = getPlanItemPrepaidQuantity({
		featureId,
		prepaidOptions: isPrepaid ? prepaidOptions : {},
		initialPrepaidOptions: isPrepaid ? initialPrepaidOptions : {},
		existingOptions: isPrepaid ? undefined : existingOptions,
		features,
	});

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
				readOnly={readOnly}
			/>
		</motion.div>
	);
}
