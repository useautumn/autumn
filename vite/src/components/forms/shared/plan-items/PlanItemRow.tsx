import type { Feature, FeatureOptions, ProductItem } from "@autumn/shared";
import { featureToOptions, UsageModel } from "@autumn/shared";
import { motion } from "motion/react";
import type { UseAttachForm } from "@/components/forms/attach-v2/hooks/useAttachForm";
import { SubscriptionItemRow } from "@/components/forms/update-subscription-v2/components/SubscriptionItemRow";
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

function hasItemChanged({
	originalItem,
	updatedItem,
}: {
	originalItem: ProductItem;
	updatedItem: ProductItem;
}): boolean {
	if (originalItem.price !== updatedItem.price) return true;
	if (originalItem.included_usage !== updatedItem.included_usage) return true;
	if (originalItem.billing_units !== updatedItem.billing_units) return true;
	if (originalItem.usage_model !== updatedItem.usage_model) return true;

	const oldTiers = originalItem.tiers ?? [];
	const newTiers = updatedItem.tiers ?? [];
	if (oldTiers.length !== newTiers.length) return true;
	for (let i = 0; i < oldTiers.length; i++) {
		if (
			oldTiers[i].amount !== newTiers[i].amount ||
			oldTiers[i].to !== newTiers[i].to
		)
			return true;
	}

	return false;
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
}: {
	item: ProductItem;
	index: number;
	originalItemsMap: Map<string, ProductItem>;
	originalItems: ProductItem[] | undefined;
	features: Feature[];
	prepaidOptions: Record<string, number>;
	initialPrepaidOptions: Record<string, number>;
	existingOptions?: FeatureOptions[];
	form: UseUpdateSubscriptionForm | UseAttachForm;
	showDiff: boolean;
	readOnly?: boolean;
}) {
	if (!item.feature_id) return null;

	const featureId = item.feature_id;
	const isPrepaid = item.usage_model === UsageModel.Prepaid;

	const currentPrepaidQuantity = isPrepaid
		? getPlanItemPrepaidQuantity({
				featureId,
				prepaidOptions,
				initialPrepaidOptions,
				features,
			})
		: undefined;

	const originalItem = originalItemsMap.get(
		`${featureId}:${item.usage_model ?? ""}`,
	);

	const isCreated =
		showDiff && !originalItem && !!originalItems && originalItems.length > 0;

	const hasChanges =
		showDiff && !!originalItem
			? hasItemChanged({ originalItem, updatedItem: item })
			: false;

	return (
		<motion.div
			key={featureId || item.price_id || index}
			layout="position"
			transition={{ layout: LAYOUT_TRANSITION }}
		>
			<SubscriptionItemRow
				item={item}
				hasChanges={hasChanges}
				prepaidQuantity={currentPrepaidQuantity}
				form={form}
				featureId={featureId}
				isCreated={isCreated}
				readOnly={readOnly}
			/>
		</motion.div>
	);
}
