import type {
	Feature,
	FeatureOptions,
	FrontendProduct,
	ProductItem,
} from "@autumn/shared";
import { sortPlanItems, splitBooleanItems } from "@autumn/shared";
import { Button } from "@autumn/ui";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { LayoutGroup, motion } from "motion/react";
import { useMemo } from "react";
import type { UseAttachForm } from "@/components/forms/attach-v2/hooks/useAttachForm";
import type { AdminPlanIds } from "@/components/forms/shared/admin/AdminPlanIdsTooltip";
import type { UseUpdateSubscriptionForm } from "@/components/forms/update-subscription-v2/hooks/useUpdateSubscriptionForm";
import { LAYOUT_TRANSITION } from "@/components/v2/sheets/SharedSheetComponents";
import { CollapsedBooleanItems } from "./plan-items/CollapsedBooleanItems";
import { DeletedItemRow } from "./plan-items/DeletedItemRow";
import { PlanEditButton } from "./plan-items/PlanEditButton";
import {
	getItemMatchKey,
	hasItemChanged,
	PlanItemRow,
} from "./plan-items/PlanItemRow";
import { PlanPriceHeader } from "./plan-items/PlanPriceHeader";
import {
	PlanTrialEditor,
	type TrialConfig,
} from "./plan-items/PlanTrialEditor";
import { PlanVersionChangeRow } from "./plan-items/PlanVersionChangeRow";

interface PriceChange {
	oldPrice: string;
	newPrice: string;
	oldIntervalText: string | null;
	newIntervalText: string | null;
	isUpgrade: boolean;
}

interface VersionChange {
	currentVersion: number;
	selectedVersion: number;
}

export interface PlanItemsSectionProps {
	product: FrontendProduct | undefined;
	originalItems: ProductItem[] | undefined;
	features: Feature[];

	prepaidOptions: Record<string, number | undefined>;
	initialPrepaidOptions: Record<string, number | undefined>;
	existingOptions?: FeatureOptions[];

	form?: UseUpdateSubscriptionForm | UseAttachForm;

	showDiff: boolean;
	currency: string;

	onEditPlan: () => void;

	priceChange?: PriceChange | null;
	versionChange?: VersionChange | null;
	trialConfig?: TrialConfig;

	gateDeletedItemsByDiff?: boolean;
	changesOnly?: boolean;
	readOnly?: boolean;
	disableBooleanCollapse?: boolean;

	adminIds?: AdminPlanIds;
}

export function getPlanItemsDiff({
	product,
	originalItems,
	showDiff,
	gateDeletedItemsByDiff = false,
}: {
	product: FrontendProduct | undefined;
	originalItems: ProductItem[] | undefined;
	showDiff: boolean;
	gateDeletedItemsByDiff?: boolean;
}) {
	const originalItemsMap = new Map<string, ProductItem>(
		originalItems
			?.filter((i) => i.feature_id)
			.map((i) => [getItemMatchKey(i), i]) ?? [],
	);

	const currentItemKeys = new Set(
		product?.items
			?.filter((i) => i.feature_id)
			.map((i) => getItemMatchKey(i)) ?? [],
	);

	const changedOriginals: ProductItem[] = [];
	if (showDiff) {
		for (const item of product?.items ?? []) {
			if (!item.feature_id) continue;
			const key = getItemMatchKey(item);
			const originalItem = originalItemsMap.get(key);
			if (originalItem && hasItemChanged({ originalItem, updatedItem: item })) {
				changedOriginals.push(originalItem);
				originalItemsMap.delete(key);
			}
		}
	}

	const isItemDeleted = (i: ProductItem) =>
		!!i.feature_id && !currentItemKeys.has(getItemMatchKey(i));

	const purelyDeletedItems = gateDeletedItemsByDiff
		? showDiff && originalItems
			? originalItems.filter(isItemDeleted)
			: []
		: (originalItems?.filter(isItemDeleted) ?? []);

	const deletedItems = [...changedOriginals, ...purelyDeletedItems];
	const sortedItems = sortPlanItems({ items: product?.items ?? [] });
	const { visibleItems, collapsedBooleanItems } = splitBooleanItems({
		items: sortedItems,
	});
	const isItemNew = (item: ProductItem) =>
		!originalItemsMap.has(getItemMatchKey(item));
	const diffVisibleItems = visibleItems.filter(isItemNew);
	const diffCollapsedBooleanItems = collapsedBooleanItems.filter(isItemNew);

	return {
		originalItemsMap,
		deletedItems,
		visibleItems,
		collapsedBooleanItems,
		diffVisibleItems,
		diffCollapsedBooleanItems,
		hasDiffItems:
			diffVisibleItems.length > 0 ||
			diffCollapsedBooleanItems.length > 0 ||
			deletedItems.length > 0,
	};
}

export function PlanItemsSection({
	product,
	originalItems,
	features,
	prepaidOptions,
	initialPrepaidOptions,
	existingOptions,
	form,
	showDiff,
	currency,
	onEditPlan,
	priceChange,
	versionChange,
	trialConfig,
	gateDeletedItemsByDiff = false,
	changesOnly = false,
	readOnly = false,
	disableBooleanCollapse = false,
	adminIds,
}: PlanItemsSectionProps) {
	const {
		originalItemsMap,
		deletedItems,
		visibleItems: allVisibleItems,
		collapsedBooleanItems: allCollapsedBooleanItems,
		diffVisibleItems,
		diffCollapsedBooleanItems,
	} = useMemo(
		() =>
			getPlanItemsDiff({
				product,
				originalItems,
				showDiff,
				gateDeletedItemsByDiff,
			}),
		[product, originalItems, showDiff, gateDeletedItemsByDiff],
	);
	const visibleItemsRaw = changesOnly ? diffVisibleItems : allVisibleItems;
	const collapsedBooleanItemsRaw = changesOnly
		? diffCollapsedBooleanItems
		: allCollapsedBooleanItems;
	const visibleItems = disableBooleanCollapse
		? [...visibleItemsRaw, ...collapsedBooleanItemsRaw]
		: visibleItemsRaw;
	const collapsedBooleanItems = disableBooleanCollapse
		? []
		: collapsedBooleanItemsRaw;

	const hasItems = (product?.items?.length ?? 0) > 0 || deletedItems.length > 0;

	if (!hasItems) {
		return (
			<Button variant="secondary" onClick={onEditPlan} className="w-full">
				<PencilSimpleIcon size={14} className="mr-1" />
				Create Custom Plan
			</Button>
		);
	}

	const itemRowProps = {
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
	};

	const itemKey = (item: ProductItem) =>
		`${item.feature_id ?? ""}-${item.price_id ?? ""}-${item.interval ?? ""}-${item.interval_count ?? ""}`;

	return (
		<div>
			{(!changesOnly || priceChange) && (
				<PlanPriceHeader
					priceChange={priceChange}
					product={product}
					currency={currency}
					adminIds={adminIds}
				/>
			)}
			<LayoutGroup>
				<motion.div
					className="flex flex-col gap-0"
					layout="position"
					transition={{ layout: LAYOUT_TRANSITION }}
				>
					{visibleItems.map((item, index) => (
						<PlanItemRow
							key={itemKey(item)}
							item={item}
							index={index}
							{...itemRowProps}
						/>
					))}
					{collapsedBooleanItems.length > 0 && (
						<CollapsedBooleanItems
							items={collapsedBooleanItems}
							triggerClassName="pl-0 pr-1"
							renderItem={(item, index) => (
								<PlanItemRow
									key={itemKey(item)}
									item={item}
									index={visibleItems.length + index}
									{...itemRowProps}
								/>
							)}
						/>
					)}
					{deletedItems.map((item, index) => (
						<DeletedItemRow
							key={`deleted-${itemKey(item)}`}
							item={item}
							index={index}
							currency={currency}
						/>
					))}
					<PlanVersionChangeRow versionChange={versionChange} />
					<PlanTrialEditor trialConfig={trialConfig} form={form} />
					{!readOnly && <PlanEditButton onEditPlan={onEditPlan} />}
				</motion.div>
			</LayoutGroup>
		</div>
	);
}
