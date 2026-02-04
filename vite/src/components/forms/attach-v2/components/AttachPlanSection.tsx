import type { ProductItem } from "@autumn/shared";
import { buildEditsForItem, UsageModel } from "@autumn/shared";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { LayoutGroup, motion } from "motion/react";
import { PriceDisplay } from "@/components/forms/update-subscription-v2/components/PriceDisplay";
import { SubscriptionItemRow } from "@/components/forms/update-subscription-v2/components/SubscriptionItemRow";
import { TrialEditorRow } from "@/components/forms/update-subscription-v2/components/TrialEditorRow";
import { LAYOUT_TRANSITION } from "@/components/forms/update-subscription-v2/constants/animationConstants";
import { Button } from "@/components/v2/buttons/Button";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useOrg } from "@/hooks/common/useOrg";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { AttachSectionTitle } from "./AttachSectionTitle";

export function AttachPlanSection() {
	const {
		form,
		formValues,
		originalItems,
		productWithFormItems: product,
		hasCustomizations,
		handleEditPlan,
	} = useAttachFormContext();

	const { prepaidOptions, trialEnabled } = formValues;

	const { org } = useOrg();
	const currency = org?.default_currency ?? "USD";

	const originalItemsMap = new Map(
		originalItems?.filter((i) => i.feature_id).map((i) => [i.feature_id, i]) ??
			[],
	);

	const currentFeatureIds = new Set(
		product?.items?.map((i) => i.feature_id).filter(Boolean) ?? [],
	);

	const deletedItems =
		hasCustomizations && originalItems
			? originalItems.filter(
					(i) => i.feature_id && !currentFeatureIds.has(i.feature_id),
				)
			: [];

	if (!product) return null;

	return (
		<SheetSection title={<AttachSectionTitle />} withSeparator>
			{(product?.items?.length ?? 0) > 0 || deletedItems.length > 0 ? (
				<>
					<div className="flex gap-2 justify-between items-center mb-3">
						<PriceDisplay product={product} currency={currency} />
					</div>
					<LayoutGroup>
						<div className="space-y-2">
							{product?.items?.map((item: ProductItem, index: number) => {
								if (!item.feature_id) return null;

								const featureId = item.feature_id;
								const isPrepaid = item.usage_model === UsageModel.Prepaid;
								const currentPrepaidQuantity = isPrepaid
									? (prepaidOptions[featureId] ?? 0)
									: undefined;

								const originalItem = originalItemsMap.get(featureId);
								const isCreated =
									hasCustomizations &&
									!originalItem &&
									originalItems &&
									originalItems.length > 0;

								const edits = hasCustomizations
									? buildEditsForItem({
											updatedItem: item,
											originalItem,
											updatedPrepaidQuantity: currentPrepaidQuantity,
											originalPrepaidQuantity: undefined,
										})
									: [];

								return (
									<motion.div
										key={featureId || item.price_id || index}
										layout
										transition={LAYOUT_TRANSITION}
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
							})}
							{deletedItems.map((item: ProductItem, index: number) => (
								<motion.div
									key={`deleted-${item.feature_id || index}`}
									layout
									transition={LAYOUT_TRANSITION}
								>
									<SubscriptionItemRow item={item} isDeleted />
								</motion.div>
							))}
							{trialEnabled && (
								<motion.div
									key="trial-editor"
									layout
									transition={LAYOUT_TRANSITION}
								>
									<TrialEditorRow
										form={form}
										onCollapse={() => form.setFieldValue("trialEnabled", false)}
									/>
								</motion.div>
							)}
							<motion.div layout transition={LAYOUT_TRANSITION}>
								<Button
									variant="secondary"
									onClick={handleEditPlan}
									className="w-full"
								>
									<PencilSimpleIcon size={14} className="mr-1" />
									Edit Plan Items
								</Button>
							</motion.div>
						</div>
					</LayoutGroup>
				</>
			) : (
				<Button variant="secondary" onClick={handleEditPlan} className="w-full">
					<PencilSimpleIcon size={14} className="mr-1" />
					Edit Plan Items
				</Button>
			)}
		</SheetSection>
	);
}
