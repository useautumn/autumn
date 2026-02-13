import { motion } from "motion/react";
import { useMemo } from "react";
import { PlanItemsSection } from "@/components/forms/shared";
import {
	STAGGER_CONTAINER,
	STAGGER_ITEM,
	STAGGER_ITEM_LAYOUT,
} from "@/components/forms/update-subscription-v2/constants/animationConstants";
import {
	LAYOUT_TRANSITION,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useOrg } from "@/hooks/common/useOrg";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { outgoingToProductItems } from "../utils/attachDiffUtils";
import { AttachPlanSkeleton } from "./AttachPlanSkeleton";
import { AttachSectionTitle } from "./AttachSectionTitle";

export function AttachPlanSection() {
	const {
		form,
		formValues,
		features,
		originalItems: productTemplateItems,
		productWithFormItems: product,
		hasCustomizations,
		initialPrepaidOptions,
		handleEditPlan,
		previewQuery,
	} = useAttachFormContext();

	const { prepaidOptions, trialEnabled } = formValues;

	const { org } = useOrg();
	const currency = org?.default_currency ?? "USD";

	// Convert outgoing balances to ProductItem format for diff comparison
	// This shows what the customer is losing (outgoing) vs gaining (incoming)
	const outgoingItems = useMemo(
		() => outgoingToProductItems(previewQuery.data?.outgoing),
		[previewQuery.data?.outgoing],
	);

	// Use outgoing items as the "original" for comparison when available
	// This enables diffs like "100 → 200" for features in outgoing products
	// Falls back to product template if no outgoing (new customer or no replacements)
	const originalItemsForDiff =
		outgoingItems.length > 0 ? outgoingItems : productTemplateItems;

	// When there are outgoing items, always show diffs because we're comparing
	// outgoing (what customer has) vs incoming (what they're getting) - different things
	const showDiffs = hasCustomizations || outgoingItems.length > 0;

	// Show skeleton only on initial load (isPending = no data yet)
	// Subsequent fetches keep showing previous data via keepPreviousData
	if (previewQuery.isPending) {
		return <AttachPlanSkeleton />;
	}

	if (!product) return null;

	const hasItems =
		(product?.items?.length ?? 0) > 0 ||
		(showDiffs &&
			originalItemsForDiff?.some(
				(i) =>
					i.feature_id &&
					!product?.items?.some((pi) => pi.feature_id === i.feature_id),
			));

	// Common props for PlanItemsSection
	const planItemsProps = {
		product,
		originalItems: originalItemsForDiff,
		features,
		prepaidOptions,
		initialPrepaidOptions,
		form,
		hasCustomizations: showDiffs,
		currency,
		onEditPlan: handleEditPlan,
		gateDeletedItemsByCustomizations: true,
	} as const;

	return (
		<SheetSection withSeparator>
			<motion.div
				className="flex flex-col gap-3"
				initial="hidden"
				animate="visible"
				variants={STAGGER_CONTAINER}
			>
				<motion.div
					layout="position"
					transition={{ layout: LAYOUT_TRANSITION }}
					variants={STAGGER_ITEM_LAYOUT}
				>
					<h3 className="text-sub select-none w-full">
						<AttachSectionTitle />
					</h3>
				</motion.div>
				{hasItems ? (
					<PlanItemsSection
						{...planItemsProps}
						trialConfig={{
							trialEnabled,
							onTrialCollapse: () => form.setFieldValue("trialEnabled", false),
						}}
						useStaggerAnimation
					/>
				) : (
					<motion.div variants={STAGGER_ITEM}>
						<PlanItemsSection {...planItemsProps} />
					</motion.div>
				)}
			</motion.div>
		</SheetSection>
	);
}
