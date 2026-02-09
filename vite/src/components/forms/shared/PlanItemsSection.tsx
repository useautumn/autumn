import type {
	Feature,
	FeatureOptions,
	FrontendProduct,
	ProductItem,
} from "@autumn/shared";
import {
	buildEditsForItem,
	featureToOptions,
	UsageModel,
} from "@autumn/shared";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import type { UseAttachForm } from "@/components/forms/attach-v2/hooks/useAttachForm";
import { PriceDisplay } from "@/components/forms/update-subscription-v2/components/PriceDisplay";
import { SubscriptionItemRow } from "@/components/forms/update-subscription-v2/components/SubscriptionItemRow";
import { TrialEditorRow } from "@/components/forms/update-subscription-v2/components/TrialEditorRow";
import { VersionChangeRow } from "@/components/forms/update-subscription-v2/components/VersionChangeRow";
import {
	FAST_TRANSITION,
	STAGGER_CONTAINER,
	STAGGER_ITEM,
	STAGGER_ITEM_LAYOUT,
} from "@/components/forms/update-subscription-v2/constants/animationConstants";
import type { UseTrialStateReturn } from "@/components/forms/update-subscription-v2/hooks/useTrialState";
import type { UseUpdateSubscriptionForm } from "@/components/forms/update-subscription-v2/hooks/useUpdateSubscriptionForm";
import { Button } from "@/components/v2/buttons/Button";
import { LAYOUT_TRANSITION } from "@/components/v2/sheets/SharedSheetComponents";

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

interface TrialConfigSimple {
	trialEnabled: boolean;
	onTrialCollapse: () => void;
}

interface TrialConfigComplex {
	trialState: UseTrialStateReturn;
}

type TrialConfig = TrialConfigSimple | TrialConfigComplex;

function isComplexTrialConfig(
	config: TrialConfig,
): config is TrialConfigComplex {
	return "trialState" in config;
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
	const originalItemsMap = new Map(
		originalItems?.filter((i) => i.feature_id).map((i) => [i.feature_id, i]) ??
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

	const showTrialEditor = trialConfig
		? isComplexTrialConfig(trialConfig)
			? trialConfig.trialState.isTrialExpanded ||
				trialConfig.trialState.removeTrial
			: trialConfig.trialEnabled
		: false;

	const showVersionChange =
		versionChange &&
		versionChange.selectedVersion !== versionChange.currentVersion;

	if (!hasItems) {
		return (
			<Button variant="secondary" onClick={onEditPlan} className="w-full">
				<PencilSimpleIcon size={14} className="mr-1" />
				Edit Plan Items
			</Button>
		);
	}

	const renderPriceDisplay = () => {
		if (priceChange) {
			return (
				<span className="flex items-center gap-1.5">
					<span className="text-t3">
						{priceChange.oldPrice}
						{priceChange.oldIntervalText && ` ${priceChange.oldIntervalText}`}
					</span>
					<span className="text-t4">-&gt;</span>
					<span className="font-semibold text-t1">{priceChange.newPrice}</span>
					<span className="text-t3">{priceChange.newIntervalText}</span>
				</span>
			);
		}
		return <PriceDisplay product={product} currency={currency} />;
	};

	const renderItemRow = (item: ProductItem, index: number) => {
		if (!item.feature_id) return null;

		const featureId = item.feature_id;
		const isPrepaid = item.usage_model === UsageModel.Prepaid;

		let currentPrepaidQuantity: number | undefined;
		if (isPrepaid) {
			currentPrepaidQuantity = prepaidOptions[featureId];
		} else if (existingOptions) {
			const featureForOptions = features?.find((f) => f.id === featureId);
			const prepaidOption = featureToOptions({
				feature: featureForOptions,
				options: existingOptions,
			});
			currentPrepaidQuantity = prepaidOption?.quantity;
		}

		const initialPrepaidQuantity = isPrepaid
			? initialPrepaidOptions[featureId]
			: undefined;

		const originalItem = originalItemsMap.get(featureId);

		// Feature is "created" if it doesn't exist in originalItems
		// For attach: originalItems comes from outgoing products (what's being replaced)
		// For update: originalItems comes from current subscription
		const isCreated =
			!originalItem && originalItems && originalItems.length > 0;

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
				variants={useStaggerAnimation ? STAGGER_ITEM_LAYOUT : undefined}
				transition={{ layout: LAYOUT_TRANSITION }}
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
	};

	const renderDeletedItemRow = (item: ProductItem, index: number) => (
		<motion.div
			key={`deleted-${item.feature_id || index}`}
			layout="position"
			variants={useStaggerAnimation ? STAGGER_ITEM_LAYOUT : undefined}
			transition={{ layout: LAYOUT_TRANSITION }}
		>
			<SubscriptionItemRow item={item} isDeleted />
		</motion.div>
	);

	const renderVersionChangeRow = () => {
		if (!showVersionChange || !versionChange) return null;
		return (
			<motion.div
				key="version-change"
				layout="position"
				variants={useStaggerAnimation ? STAGGER_ITEM_LAYOUT : undefined}
				transition={{ layout: LAYOUT_TRANSITION }}
			>
				<VersionChangeRow
					currentVersion={versionChange.currentVersion}
					selectedVersion={versionChange.selectedVersion}
				/>
			</motion.div>
		);
	};

	const renderTrialEditor = () => {
		if (!trialConfig || !showTrialEditor) return null;

		if (isComplexTrialConfig(trialConfig)) {
			const { trialState } = trialConfig;
			return (
				<motion.div
					key="trial-editor"
					layout
					transition={{ layout: LAYOUT_TRANSITION }}
					variants={useStaggerAnimation ? STAGGER_ITEM : undefined}
				>
					<TrialEditorRow
						form={form}
						isCurrentlyTrialing={trialState.isCurrentlyTrialing}
						initialTrialLength={trialState.remainingTrialDays}
						initialTrialFormatted={trialState.remainingTrialFormatted}
						removeTrial={trialState.removeTrial}
						onEndTrial={trialState.handleEndTrial}
						onCollapse={() => trialState.setIsTrialExpanded(false)}
						onRevert={trialState.handleRevertTrial}
					/>
				</motion.div>
			);
		}

		return (
			<AnimatePresence mode="popLayout">
				{trialConfig.trialEnabled && (
					<motion.div
						key="trial-editor"
						layout
						initial={{ opacity: 0, y: 8 }}
						animate={{
							opacity: 1,
							y: 0,
							transition: { ...FAST_TRANSITION, delay: 0.15 },
						}}
						exit={{
							opacity: 0,
							y: -8,
							transition: FAST_TRANSITION,
						}}
						transition={{ layout: LAYOUT_TRANSITION }}
					>
						<TrialEditorRow
							form={form}
							onCollapse={trialConfig.onTrialCollapse}
						/>
					</motion.div>
				)}
			</AnimatePresence>
		);
	};

	const renderEditButton = () => (
		<motion.div
			variants={useStaggerAnimation ? STAGGER_ITEM_LAYOUT : undefined}
		>
			<Button variant="secondary" onClick={onEditPlan} className="w-full">
				<PencilSimpleIcon size={14} className="mr-1" />
				Edit Plan Items
			</Button>
		</motion.div>
	);

	if (useStaggerAnimation) {
		return (
			<LayoutGroup>
				<motion.div
					className="space-y-2"
					layout
					transition={{ layout: LAYOUT_TRANSITION }}
					initial="hidden"
					animate="visible"
					variants={STAGGER_CONTAINER}
				>
					<motion.div
						layout="position"
						transition={{ layout: LAYOUT_TRANSITION }}
						variants={STAGGER_ITEM_LAYOUT}
						className="flex gap-2 justify-between items-center"
					>
						{renderPriceDisplay()}
					</motion.div>
					{product?.items?.map(renderItemRow)}
					{deletedItems.map(renderDeletedItemRow)}
					{renderTrialEditor()}
					{renderEditButton()}
				</motion.div>
			</LayoutGroup>
		);
	}

	return (
		<>
			<div className="flex gap-2 justify-between items-center mb-3">
				{renderPriceDisplay()}
			</div>
			<LayoutGroup>
				<motion.div
					className="space-y-2"
					layout
					transition={{ layout: LAYOUT_TRANSITION }}
				>
					{product?.items?.map(renderItemRow)}
					{deletedItems.map(renderDeletedItemRow)}
					{renderVersionChangeRow()}
					{renderTrialEditor()}
					{renderEditButton()}
				</motion.div>
			</LayoutGroup>
		</>
	);
}
