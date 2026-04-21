import type {
	Feature,
	FeatureOptions,
	FrontendProduct,
	ProductItem,
} from "@autumn/shared";
import { sortPlanItems, splitBooleanItems } from "@autumn/shared";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { LayoutGroup, motion } from "motion/react";
import { useMemo } from "react";
import type { UseAttachForm } from "@/components/forms/attach-v2/hooks/useAttachForm";
import type { UseUpdateSubscriptionForm } from "@/components/forms/update-subscription-v2/hooks/useUpdateSubscriptionForm";
import { Button } from "@/components/v2/buttons/Button";
import { LAYOUT_TRANSITION } from "@/components/v2/sheets/SharedSheetComponents";
import { CollapsedBooleanItems } from "./plan-items/CollapsedBooleanItems";
import { DeletedItemRow } from "./plan-items/DeletedItemRow";
import { PlanEditButton } from "./plan-items/PlanEditButton";
import { PlanItemRow } from "./plan-items/PlanItemRow";
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

	form: UseUpdateSubscriptionForm | UseAttachForm;

	showDiff: boolean;
	currency: string;

	onEditPlan: () => void;

	priceChange?: PriceChange | null;
	versionChange?: VersionChange | null;
	trialConfig?: TrialConfig;

	gateDeletedItemsByDiff?: boolean;
	readOnly?: boolean;
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
	readOnly = false,
}: PlanItemsSectionProps) {
	const originalItemsMap = new Map<string, ProductItem>(
		originalItems
			?.filter((i) => i.feature_id)
			.map((i) => [`${i.feature_id}:${i.usage_model ?? ""}`, i]) ?? [],
	);

	const currentFeatureIds = new Set(
		product?.items?.map((i) => i.feature_id).filter(Boolean) ?? [],
	);

	const deletedItems = gateDeletedItemsByDiff
		? showDiff && originalItems
			? originalItems.filter(
					(i) => i.feature_id && !currentFeatureIds.has(i.feature_id),
				)
			: []
		: (originalItems?.filter(
				(i) => i.feature_id && !currentFeatureIds.has(i.feature_id),
			) ?? []);

	const sortedItems = useMemo(
		() => sortPlanItems({ items: product?.items ?? [] }),
		[product?.items],
	);
	const { visibleItems, collapsedBooleanItems } = useMemo(
		() => splitBooleanItems({ items: sortedItems }),
		[sortedItems],
	);

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
	};

	const itemKey = (item: ProductItem) =>
		`${item.feature_id ?? ""}-${item.price_id ?? ""}-${item.interval ?? ""}-${item.interval_count ?? ""}`;

	return (
		<div>
			<PlanPriceHeader
				priceChange={priceChange}
				product={product}
				currency={currency}
			/>
			<LayoutGroup>
				<motion.div
					className="flex flex-col gap-1.5"
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
