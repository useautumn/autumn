import type { Feature, FeatureOptions, ProductItem } from "@autumn/shared";
import { featureToOptions, itemsAreSame, UsageModel } from "@autumn/shared";
import { motion } from "motion/react";
import type { UseAttachForm } from "@/components/forms/attach-v2/hooks/useAttachForm";
import { SubscriptionItemRow } from "@/components/forms/update-subscription-v2/components/SubscriptionItemRow";
import type { UseUpdateSubscriptionForm } from "@/components/forms/update-subscription-v2/hooks/useUpdateSubscriptionForm";
import { LAYOUT_TRANSITION } from "@/components/v2/sheets/SharedSheetComponents";

export function getItemMatchKey(item: ProductItem): string {
	return `${item.feature_id}:${item.usage_model ?? ""}:${item.interval ?? ""}`;
}

export function getPlanItemPrepaidQuantity({
	featureId,
	prepaidOptions,
	initialPrepaidOptions,
	existingOptions,
	features,
}: {
	featureId: string;
	prepaidOptions: Record<string, number | undefined>;
	initialPrepaidOptions: Record<string, number | undefined>;
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

export function hasItemChanged({
	originalItem,
	updatedItem,
}: {
	originalItem: ProductItem;
	updatedItem: ProductItem;
}): boolean {
	return !itemsAreSame({ item1: originalItem, item2: updatedItem }).same;
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
	showDiff,
	readOnly,
	currency,
}: {
	item: ProductItem;
	index: number;
	originalItemsMap: Map<string, ProductItem>;
	originalItems: ProductItem[] | undefined;
	features: Feature[];
	prepaidOptions: Record<string, number | undefined>;
	initialPrepaidOptions: Record<string, number | undefined>;
	existingOptions?: FeatureOptions[];
	form?: UseUpdateSubscriptionForm | UseAttachForm;
	showDiff: boolean;
	readOnly?: boolean;
	currency?: string;
}) {
	if (!item.feature_id) return null;

	const featureId = item.feature_id;
	const isPrepaid = item.usage_model === UsageModel.Prepaid;

	const currentPrepaidQuantity = isPrepaid
		? getPlanItemPrepaidQuantity({
				featureId,
				prepaidOptions,
				initialPrepaidOptions,
				existingOptions,
				features,
			})
		: undefined;

	const originalItem = originalItemsMap.get(getItemMatchKey(item));

	const isCreated =
		showDiff && !originalItem && !!originalItems && originalItems.length > 0;

	return (
		<motion.div
			key={featureId || item.price_id || index}
			layout="position"
			transition={{ layout: LAYOUT_TRANSITION }}
		>
			<SubscriptionItemRow
				item={item}
				prepaidQuantity={currentPrepaidQuantity}
				form={form}
				featureId={featureId}
				isCreated={isCreated}
				readOnly={readOnly}
				currency={currency}
			/>
		</motion.div>
	);
}
