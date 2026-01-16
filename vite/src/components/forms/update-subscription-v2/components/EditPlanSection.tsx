import type {
	Feature,
	FullCusProduct,
	ProductItem,
	ProductV2,
} from "@autumn/shared";
import {
	buildEditsForItem,
	featureToOptions,
	UsageModel,
} from "@autumn/shared";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { BasePriceDisplay } from "@/views/products/plan/components/plan-card/BasePriceDisplay";
import type { UseUpdateSubscriptionForm } from "../hooks/useUpdateSubscriptionForm";
import { SectionTitle } from "./SectionTitle";
import { SubscriptionItemRow } from "./SubscriptionItemRow";

interface EditPlanSectionProps {
	hasCustomizations: boolean;
	onEditPlan: () => void;
	product?: ProductV2;
	originalItems?: ProductItem[];
	customerProduct?: FullCusProduct;
	features?: Feature[];
	form?: UseUpdateSubscriptionForm;
	numVersions?: number;
	currentVersion?: number;
	prepaidOptions?: Record<string, number>;
	initialPrepaidOptions?: Record<string, number>;
}

export function EditPlanSection({
	hasCustomizations,
	onEditPlan,
	product,
	originalItems,
	customerProduct,
	features,
	form,
	numVersions,
	currentVersion,
	prepaidOptions = {},
	initialPrepaidOptions = {},
}: EditPlanSectionProps) {
	const originalItemsMap = new Map(
		originalItems?.filter((i) => i.feature_id).map((i) => [i.feature_id, i]) ??
			[],
	);

	const currentFeatureIds = new Set(
		product?.items?.map((i) => i.feature_id).filter(Boolean) ?? [],
	);
	const deletedItems =
		originalItems?.filter(
			(i) => i.feature_id && !currentFeatureIds.has(i.feature_id),
		) ?? [];

	return (
		<SheetSection
			title={
				<SectionTitle
					hasCustomizations={hasCustomizations}
					form={form}
					numVersions={numVersions}
					currentVersion={currentVersion}
				/>
			}
			withSeparator
		>
			{(product?.items?.length ?? 0) > 0 || deletedItems.length > 0 ? (
				<>
					<div className="flex gap-2 justify-between items-center h-6 mb-3">
						<BasePriceDisplay product={product} readOnly={true} />
					</div>
					<div className="space-y-2 mb-4">
						{product?.items?.map((item: ProductItem, index: number) => {
							if (!item.feature_id) return null;

							const featureId = item.feature_id;
							const featureForOptions = features?.find(
								(f) => f.id === featureId,
							);
							const prepaidOption = featureToOptions({
								feature: featureForOptions,
								options: customerProduct?.options,
							});

							const isPrepaid = item.usage_model === UsageModel.Prepaid;
							const currentPrepaidQuantity = isPrepaid
								? prepaidOptions[featureId]
								: prepaidOption?.quantity;
							const initialPrepaidQuantity = isPrepaid
								? initialPrepaidOptions[featureId]
								: undefined;

							const originalItem = originalItemsMap.get(featureId);
							const isCreated =
								!originalItem && originalItems && originalItems.length > 0;
							const edits = buildEditsForItem({
								updatedItem: item,
								originalItem,
								updatedPrepaidQuantity: currentPrepaidQuantity,
								originalPrepaidQuantity: initialPrepaidQuantity,
							});

							return (
								<SubscriptionItemRow
									key={featureId || item.price_id || index}
									item={item}
									edits={edits}
									prepaidQuantity={currentPrepaidQuantity}
									form={form}
									featureId={featureId}
									isCreated={isCreated}
								/>
							);
						})}
						{deletedItems.map((item: ProductItem, index: number) => (
							<SubscriptionItemRow
								key={`deleted-${item.feature_id || index}`}
								item={item}
								isDeleted
							/>
						))}
					</div>
				</>
			) : null}
			<Button variant="secondary" onClick={onEditPlan} className="w-full">
				<PencilSimpleIcon size={14} className="mr-1" />
				Edit Plan Items
			</Button>
		</SheetSection>
	);
}
