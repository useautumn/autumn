import type {
	Feature,
	FullCusProduct,
	ProductItem,
	ProductV2,
} from "@autumn/shared";
import {
	buildEditsForItem,
	featureToOptions,
	formatAmount,
	formatInterval,
	isPriceItem,
	UsageModel,
} from "@autumn/shared";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useOrg } from "@/hooks/common/useOrg";
import { cn } from "@/lib/utils";
import type { UseTrialStateReturn } from "../hooks/useTrialState";
import type { UseUpdateSubscriptionForm } from "../hooks/useUpdateSubscriptionForm";
import { PriceDisplay } from "./PriceDisplay";
import { SectionTitle } from "./SectionTitle";
import { SubscriptionItemRow } from "./SubscriptionItemRow";
import { TrialEditorRow } from "./TrialEditorRow";
import { VersionChangeRow } from "./VersionChangeRow";

interface EditPlanSectionProps {
	hasCustomizations: boolean;
	onEditPlan: () => void;
	product?: ProductV2;
	originalItems?: ProductItem[];
	customerProduct?: FullCusProduct;
	features?: Feature[];
	form: UseUpdateSubscriptionForm;
	numVersions?: number;
	currentVersion?: number;
	prepaidOptions?: Record<string, number>;
	initialPrepaidOptions?: Record<string, number>;
	trialState: UseTrialStateReturn;
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
	trialState,
}: EditPlanSectionProps) {
	const { org } = useOrg();
	const currency = org?.default_currency ?? "USD";

	const priceItem = product?.items?.find((i) => isPriceItem(i));
	const isPaidProduct = priceItem?.price && priceItem.price > 0;

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

	const priceChange = useMemo(() => {
		const originalPriceItem = originalItems?.find((i) => isPriceItem(i));
		const currentPriceItem = product?.items?.find((i) => isPriceItem(i));

		const originalPrice = originalPriceItem?.price ?? 0;
		const currentPrice = currentPriceItem?.price ?? 0;

		const originalInterval = originalPriceItem?.interval;
		const currentInterval = currentPriceItem?.interval;
		const originalIntervalCount = originalPriceItem?.interval_count ?? 1;
		const currentIntervalCount = currentPriceItem?.interval_count ?? 1;

		const priceChanged = originalPrice !== currentPrice;
		const intervalChanged =
			originalInterval !== currentInterval ||
			originalIntervalCount !== currentIntervalCount;

		if (!priceChanged && !intervalChanged) return null;

		const formatPrice = (amount: number) =>
			formatAmount({
				currency,
				amount,
				amountFormatOptions: {
					style: "currency",
					currencyDisplay: "narrowSymbol",
				},
			});

		const oldIntervalText = originalInterval
			? formatInterval({
					interval: originalInterval,
					intervalCount: originalIntervalCount,
				})
			: null;

		const newIntervalText = currentInterval
			? formatInterval({
					interval: currentInterval,
					intervalCount: currentIntervalCount,
				})
			: (oldIntervalText ?? "per month");

		return {
			oldPrice: formatPrice(originalPrice),
			newPrice: formatPrice(currentPrice),
			oldIntervalText: intervalChanged ? oldIntervalText : null,
			newIntervalText,
			isUpgrade: currentPrice > originalPrice,
		};
	}, [originalItems, product?.items, currency]);

	const selectedVersion = form.getFieldValue("version");
	const showVersionChange =
		currentVersion !== undefined &&
		selectedVersion !== undefined &&
		selectedVersion !== currentVersion;

	return (
		<SheetSection
			title={
				<SectionTitle
					hasCustomizations={hasCustomizations}
					form={form}
					numVersions={numVersions}
					currentVersion={currentVersion}
					trialState={trialState}
					isPaidProduct={!!isPaidProduct}
				/>
			}
			withSeparator
		>
			{(product?.items?.length ?? 0) > 0 || deletedItems.length > 0 ? (
				<>
					<div className="flex gap-2 justify-between items-center mb-3">
						{priceChange ? (
							<span className="flex items-center gap-1.5">
								<span className="text-t3">
									{priceChange.oldPrice}
									{priceChange.oldIntervalText &&
										` ${priceChange.oldIntervalText}`}
								</span>
								<span className="text-t4">→</span>
								<span className="font-semibold text-t1">
									{priceChange.newPrice}
								</span>
								<span className="text-t3">{priceChange.newIntervalText}</span>
							</span>
						) : (
							<PriceDisplay product={product} currency={currency} />
						)}
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
						{showVersionChange && (
							<VersionChangeRow
								currentVersion={currentVersion}
								selectedVersion={selectedVersion}
							/>
						)}
						{isPaidProduct && form && (
							<div
								className={cn(
									"grid transition-[grid-template-rows] duration-200 ease-out",
									trialState.isTrialExpanded ||
										trialState.removeTrial ||
										trialState.isCurrentlyTrialing ||
										trialState.hasTrialValue
										? "grid-rows-[1fr]"
										: "grid-rows-[0fr]",
								)}
							>
								<div className="overflow-hidden">
									<TrialEditorRow
										form={form}
										isCurrentlyTrialing={trialState.isCurrentlyTrialing}
										initialTrialLength={trialState.remainingTrialDays}
										initialTrialFormatted={trialState.remainingTrialFormatted}
										removeTrial={trialState.removeTrial}
										onEndTrial={trialState.handleEndTrial}
										onCollapse={() => trialState.setIsTrialExpanded(false)}
										onRevert={trialState.handleRevertTrial}
										onConfirm={() => trialState.setIsTrialConfirmed(true)}
									/>
								</div>
							</div>
						)}
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
