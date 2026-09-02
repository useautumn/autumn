import {
	type CreditSchemaItem,
	type Feature,
	getFeatureName,
	isAiCreditSystem,
} from "@autumn/shared";
import { IconButton } from "@autumn/ui";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { getFeatureIcon } from "@/views/products/features/utils/getFeatureIcon";
import { creditRateSummary } from "../utils/creditRateSummary";
import {
	addTier,
	isGraduated,
	setRateType,
	updateTier,
} from "../utils/creditSchemaUtils";
import { CreditBillingUnits } from "./CreditBillingUnits";
import { CreditNumberInput } from "./CreditNumberInput";
import { CreditTierRows } from "./CreditTierRows";
import { FeatureSelectDropdown } from "./FeatureSelectDropdown";

interface CreditRateCardRowProps {
	item: CreditSchemaItem;
	availableFeatures: Feature[];
	allFeatures: Feature[];
	onChange: (item: CreditSchemaItem) => void;
	onRemove: () => void;
	isExpanded: boolean;
	onToggle: () => void;
	showRateCardControls: boolean;
}

export function CreditRateCardRow({
	item,
	availableFeatures,
	allFeatures,
	onChange,
	onRemove,
	isExpanded,
	onToggle,
	showRateCardControls,
}: CreditRateCardRowProps) {
	const selectedFeature = allFeatures.find(
		(f: Feature) => f.id === item.metered_feature_id,
	);
	const billingUnits = item.feature_amount ?? 1;
	const isAiChild = isAiCreditSystem(selectedFeature?.type);
	const unitName = isAiChild
		? "of AI usage"
		: getFeatureName({
				feature: selectedFeature,
				plural: billingUnits !== 1,
				capitalize: false,
			}) || "units";

	const isMultiTier = isGraduated(item) && item.tiers.length > 1;
	const singleTierCost = isGraduated(item)
		? item.tiers[0]?.credit_amount
		: item.credit_amount;

	const setSingleTierCost = (credit_amount: number) =>
		onChange(
			isGraduated(item)
				? updateTier({ item, index: 0, patch: { credit_amount } })
				: { ...item, credit_amount },
		);

	const handleAddTier = () =>
		onChange(
			addTier(
				isGraduated(item) ? item : setRateType({ item, rateType: "graduated" }),
			),
		);

	if (!selectedFeature) {
		return (
			<div className="flex items-center gap-2">
				<div className="min-w-0 flex-1">
					<FeatureSelectDropdown
						value={item.metered_feature_id}
						onValueChange={(metered_feature_id) =>
							onChange({ ...item, metered_feature_id })
						}
						availableFeatures={availableFeatures}
						allFeatures={allFeatures}
					/>
				</div>
				<IconButton
					aria-label="Remove rate card item"
					type="button"
					variant="secondary"
					iconOrientation="center"
					className="h-input w-10 shrink-0 rounded-lg text-tertiary-foreground hover:text-red-500"
					icon={<TrashIcon size={14} />}
					onClick={onRemove}
				/>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"rounded-lg",
				isExpanded ? "border" : "input-base input-state-open-tiny",
			)}
		>
			<div className="group flex h-9 w-full items-center gap-2 rounded-lg pr-2">
				<button
					type="button"
					aria-expanded={isExpanded}
					onClick={onToggle}
					className="flex h-full min-w-0 flex-1 cursor-pointer select-none items-center gap-2 rounded-lg px-2 text-left"
				>
					<span className="shrink-0">
						{getFeatureIcon({ feature: selectedFeature })}
					</span>
					<span className="truncate text-sm">{selectedFeature.name}</span>
					{!isExpanded && (
						<span className="ml-auto min-w-0 truncate text-tertiary-foreground text-xs">
							{creditRateSummary({ item, unitName, isAiChild })}
						</span>
					)}
				</button>
				<IconButton
					aria-label="Remove rate card item"
					type="button"
					variant="skeleton"
					iconOrientation="center"
					className={cn(
						"shrink-0 text-tertiary-foreground transition-opacity duration-150 hover:text-red-500",
						!isExpanded &&
							"opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
					)}
					icon={<TrashIcon size={12} />}
					onClick={onRemove}
				/>
			</div>

			{isExpanded && (
				<div className="flex flex-col gap-2 p-2 pt-0">
					{isMultiTier && showRateCardControls ? (
						<>
							<CreditTierRows item={item} onChange={onChange} />
							<CreditBillingUnits
								className="w-fit"
								value={item.feature_amount}
								unitName={unitName}
								isAiChild={isAiChild}
								onValueChange={(feature_amount) =>
									onChange({ ...item, feature_amount })
								}
							/>
						</>
					) : (
						!isMultiTier && (
							<div className="flex items-center gap-2">
								<CreditNumberInput
									ariaLabel="Credit cost"
									className="min-w-32 flex-1"
									placeholder="eg. 1"
									value={singleTierCost}
									onValueChange={setSingleTierCost}
								/>
								{showRateCardControls ? (
									<>
										<CreditBillingUnits
											value={item.feature_amount}
											unitName={unitName}
											isAiChild={isAiChild}
											onValueChange={(feature_amount) =>
												onChange({ ...item, feature_amount })
											}
										/>
										<IconButton
											type="button"
											variant="muted"
											className="ml-auto shrink-0 text-tertiary-foreground text-xs"
											icon={<PlusIcon size={10} />}
											onClick={handleAddTier}
										>
											Add Tier
										</IconButton>
									</>
								) : (
									<span className="text-tertiary-foreground text-xs">
										credits
									</span>
								)}
							</div>
						)
					)}
				</div>
			)}
		</div>
	);
}
