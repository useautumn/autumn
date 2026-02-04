import type { ProductItem } from "@autumn/shared";
import { buildEditsForItem, UsageModel } from "@autumn/shared";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { LayoutGroup, motion } from "motion/react";
import { PriceDisplay } from "@/components/forms/update-subscription-v2/components/PriceDisplay";
import { SubscriptionItemRow } from "@/components/forms/update-subscription-v2/components/SubscriptionItemRow";
import { TrialEditorRow } from "@/components/forms/update-subscription-v2/components/TrialEditorRow";
import {
	LAYOUT_TRANSITION,
	STAGGER_CONTAINER,
	STAGGER_ITEM,
} from "@/components/forms/update-subscription-v2/constants/animationConstants";
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
		<SheetSection withSeparator>
			{(product?.items?.length ?? 0) > 0 || deletedItems.length > 0 ? (
				<LayoutGroup>
					<motion.div
						className="space-y-2"
						initial="hidden"
						animate="visible"
						variants={STAGGER_CONTAINER}
					>
						<motion.div variants={STAGGER_ITEM}>
							<h3 className="text-sub select-none w-full">
								<AttachSectionTitle />
							</h3>
						</motion.div>

						<motion.div
							variants={STAGGER_ITEM}
							className="flex gap-2 justify-between items-center"
						>
							<PriceDisplay product={product} currency={currency} />
						</motion.div>

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
									variants={STAGGER_ITEM}
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
								variants={STAGGER_ITEM}
								transition={LAYOUT_TRANSITION}
							>
								<SubscriptionItemRow item={item} isDeleted />
							</motion.div>
						))}
						{trialEnabled && (
							<motion.div
								key="trial-editor"
								layout
								variants={STAGGER_ITEM}
								transition={LAYOUT_TRANSITION}
							>
								<TrialEditorRow
									form={form}
									onCollapse={() => form.setFieldValue("trialEnabled", false)}
								/>
							</motion.div>
						)}
						<motion.div
							layout
							variants={STAGGER_ITEM}
							transition={LAYOUT_TRANSITION}
						>
							<Button
								variant="secondary"
								onClick={handleEditPlan}
								className="w-full"
							>
								<PencilSimpleIcon size={14} className="mr-1" />
								Edit Plan Items
							</Button>
						</motion.div>
					</motion.div>
				</LayoutGroup>
			) : (
				<>
					<div className="flex items-center justify-between h-6 mb-2">
						<h3 className="text-sub select-none w-full">
							<AttachSectionTitle />
						</h3>
					</div>
					<Button
						variant="secondary"
						onClick={handleEditPlan}
						className="w-full"
					>
						<PencilSimpleIcon size={14} className="mr-1" />
						Edit Plan Items
					</Button>
				</>
			)}
		</SheetSection>
	);
}
