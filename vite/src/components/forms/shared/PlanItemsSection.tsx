import type {
	Feature,
	FeatureOptions,
	FrontendProduct,
	ProductItem,
} from "@autumn/shared";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { LayoutGroup, motion } from "motion/react";
import type { UseAttachForm } from "@/components/forms/attach-v2/hooks/useAttachForm";
import { STAGGER_CONTAINER } from "@/components/forms/update-subscription-v2/constants/animationConstants";
import type { UseUpdateSubscriptionForm } from "@/components/forms/update-subscription-v2/hooks/useUpdateSubscriptionForm";
import { Button } from "@/components/v2/buttons/Button";
import { LAYOUT_TRANSITION } from "@/components/v2/sheets/SharedSheetComponents";
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

	prepaidOptions: Record<string, number>;
	initialPrepaidOptions: Record<string, number>;
	existingOptions?: FeatureOptions[];

	form: UseUpdateSubscriptionForm | UseAttachForm;

	hasCustomizations: boolean;
	currency: string;

	onEditPlan: () => void;

	priceChange?: PriceChange | null;
	versionChange?: VersionChange | null;
	trialConfig?: TrialConfig;

	useStaggerAnimation?: boolean;
	gateDeletedItemsByCustomizations?: boolean;
}

export function PlanItemsSection({
	product,
	originalItems,
	features,
	prepaidOptions,
	initialPrepaidOptions,
	existingOptions,
	form,
	hasCustomizations,
	currency,
	onEditPlan,
	priceChange,
	versionChange,
	trialConfig,
	useStaggerAnimation = false,
	gateDeletedItemsByCustomizations = false,
}: PlanItemsSectionProps) {
	const originalItemsMap = new Map<string | null, ProductItem>(
		originalItems?.filter((i) => i.feature_id).map((i) => [i.feature_id ?? null, i]) ??
			[],
	);

	const currentFeatureIds = new Set(
		product?.items?.map((i) => i.feature_id).filter(Boolean) ?? [],
	);

	const deletedItems = gateDeletedItemsByCustomizations
		? hasCustomizations && originalItems
			? originalItems.filter(
					(i) => i.feature_id && !currentFeatureIds.has(i.feature_id),
				)
			: []
		: (originalItems?.filter(
				(i) => i.feature_id && !currentFeatureIds.has(i.feature_id),
			) ?? []);

	const hasItems = (product?.items?.length ?? 0) > 0 || deletedItems.length > 0;

	if (!hasItems) {
		return (
			<Button variant="secondary" onClick={onEditPlan} className="w-full">
				<PencilSimpleIcon size={14} className="mr-1" />
				Edit Plan Items
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
		hasCustomizations,
	};

	if (useStaggerAnimation) {
		return (
			<LayoutGroup>
				<motion.div
					className="flex flex-col gap-3"
					layout="position"
					transition={{ layout: LAYOUT_TRANSITION }}
					initial="hidden"
					animate="visible"
					variants={STAGGER_CONTAINER}
				>
					<PlanPriceHeader
						priceChange={priceChange}
						product={product}
						currency={currency}
						useStagger
					/>
					{product?.items?.map((item, index) => (
						<PlanItemRow
							key={item.feature_id || item.price_id || index}
							item={item}
							index={index}
							useStagger
							{...itemRowProps}
						/>
					))}
					{deletedItems.map((item, index) => (
						<DeletedItemRow
							key={`deleted-${item.feature_id || index}`}
							item={item}
							index={index}
							useStagger
						/>
					))}
					<PlanTrialEditor trialConfig={trialConfig} form={form} useStagger />
					<PlanEditButton onEditPlan={onEditPlan} useStagger />
				</motion.div>
			</LayoutGroup>
		);
	}

	return (
		<>
			<PlanPriceHeader
				priceChange={priceChange}
				product={product}
				currency={currency}
			/>
			<LayoutGroup>
				<motion.div
					className="flex flex-col gap-3"
					layout="position"
					transition={{ layout: LAYOUT_TRANSITION }}
				>
					{product?.items?.map((item, index) => (
						<PlanItemRow
							key={item.feature_id || item.price_id || index}
							item={item}
							index={index}
							{...itemRowProps}
						/>
					))}
					{deletedItems.map((item, index) => (
						<DeletedItemRow
							key={`deleted-${item.feature_id || index}`}
							item={item}
							index={index}
						/>
					))}
					<PlanVersionChangeRow versionChange={versionChange} />
					<PlanTrialEditor trialConfig={trialConfig} form={form} />
					<PlanEditButton onEditPlan={onEditPlan} />
				</motion.div>
			</LayoutGroup>
		</>
	);
}
