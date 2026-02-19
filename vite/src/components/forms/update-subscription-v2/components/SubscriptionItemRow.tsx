import {
	getProductItemDisplay,
	type ItemEdit,
	type ProductItem,
	roundUsageToNearestBillingUnit,
	UsageModel,
} from "@autumn/shared";
import {
	CaretDownIcon,
	CheckIcon,
	PencilSimpleIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { UseAttachForm } from "@/components/forms/attach-v2/hooks/useAttachForm";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { ConditionalTooltip } from "@/components/v2/tooltips/ConditionalTooltip";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { PlanFeatureIcon } from "@/views/products/plan/components/plan-card/PlanFeatureIcon";
import { CustomDotIcon } from "@/views/products/plan/components/plan-card/PlanFeatureRow";
import { FAST_TRANSITION } from "../constants/animationConstants";
import type { UseUpdateSubscriptionForm } from "../hooks/useUpdateSubscriptionForm";
import { getEditIcon } from "../utils/getEditIcon";
import { getItemRingClass } from "../utils/ringClassUtils";
import { CompactValueChange } from "./CompactValueChange";
import { StatusBadge } from "./StatusBadge";

interface SubscriptionItemRowProps {
	item: ProductItem;
	edits?: ItemEdit[];
	form?: UseUpdateSubscriptionForm | UseAttachForm;
	featureId?: string;
	prepaidQuantity?: number | null;
	isDeleted?: boolean;
	isCreated?: boolean;
}

const getPrepaidQuantityTooltipData = ({
	inputQuantity,
	billingUnits,
}: {
	inputQuantity: number;
	billingUnits: number;
}) => {
	const normalizedBillingUnits = billingUnits > 0 ? billingUnits : 1;
	const roundedQuantity = roundUsageToNearestBillingUnit({
		usage: inputQuantity,
		billingUnits: normalizedBillingUnits,
	});

	return {
		roundedQuantity,
		normalizedBillingUnits,
		shouldShowRoundingHint:
			normalizedBillingUnits > 1 && roundedQuantity !== inputQuantity,
	};
};

function EditRow({
	edit,
	showRing = true,
}: {
	edit: ItemEdit;
	showRing?: boolean;
}) {
	const ringClass = edit.isUpgrade
		? "ring-1 ring-inset ring-green-500/50"
		: "ring-1 ring-inset ring-red-500/50";

	const renderDescription = () => {
		const match = edit.description.match(
			/^(.+\bfrom\s+)(\S+)(\s+to\s+)(\S+)(.*)$/,
		);
		if (match) {
			const [, prefix, oldVal, middle, newVal, suffix] = match;
			return (
				<span className="text-xs text-t3">
					{prefix}
					<span
						className={cn(
							"font-medium",
							edit.isUpgrade ? "text-red-500" : "text-green-500",
						)}
					>
						{oldVal}
					</span>
					{middle}
					<span
						className={cn(
							"font-medium",
							edit.isUpgrade ? "text-green-500" : "text-red-500",
						)}
					>
						{newVal}
					</span>
					<span className="text-t4">{suffix}</span>
				</span>
			);
		}
		return <span className="text-xs text-t3">{edit.description}</span>;
	};

	return (
		<div
			className={cn(
				"flex items-center gap-2 w-full h-9 px-3 rounded-xl",
				showRing && "input-base",
				showRing && ringClass,
			)}
		>
			{showRing && getEditIcon(edit.icon, edit.isUpgrade)}
			{showRing ? (
				renderDescription()
			) : (
				<CompactValueChange
					oldValue={edit.oldValue}
					newValue={edit.newValue}
					isUpgrade={edit.isUpgrade}
				/>
			)}
		</div>
	);
}

export function SubscriptionItemRow({
	item,
	edits = [],
	form,
	featureId,
	prepaidQuantity,
	isDeleted = false,
	isCreated = false,
}: SubscriptionItemRowProps) {
	const { org } = useOrg();
	const { features } = useFeaturesQuery();
	const [isAccordionOpen, setIsAccordionOpen] = useState(false);
	const [isEditingQuantity, setIsEditingQuantity] = useState(false);

	const display = getProductItemDisplay({
		item,
		features,
		currency: org?.default_currency || "USD",
		fullDisplay: true,
		amountFormatOptions: { currencyDisplay: "narrowSymbol" },
	});

	const feature = features.find((f) => f.id === item.feature_id);
	const hasFeatureName = feature?.name && feature.name.trim() !== "";
	const displayText = hasFeatureName
		? display.primary_text
		: "Name your feature";
	const isPrepaid = item.usage_model === UsageModel.Prepaid;

	const hasMultipleEdits = edits.length > 1;
	const singleEdit = edits.length === 1 ? edits[0] : null;
	const hasEditableEdit = edits.some((e) => e.editable);

	const rowRingClass = getItemRingClass({
		isDeleted,
		isCreated,
		hasEdits: edits.length > 0,
	});

	const renderRowIndicator = () => {
		if (isDeleted) return <StatusBadge variant="removed">Removed</StatusBadge>;
		if (isCreated) return <StatusBadge variant="created">Created</StatusBadge>;

		if (hasMultipleEdits) {
			return (
				<button
					type="button"
					className="flex items-center gap-1 text-xs text-t3 hover:text-t1"
				>
					{edits.length} Changes
					<CaretDownIcon
						size={14}
						className={cn(
							"transition-transform duration-200",
							isAccordionOpen && "rotate-180",
						)}
					/>
				</button>
			);
		}

		if (singleEdit?.editable) {
			return <EditRow edit={singleEdit} showRing={false} />;
		}

		if (singleEdit) {
			return (
				<CompactValueChange
					oldValue={singleEdit.oldValue}
					newValue={singleEdit.newValue}
					isUpgrade={singleEdit.isUpgrade}
				/>
			);
		}

		if (!isPrepaid && prepaidQuantity && edits.length === 0) {
			return (
				<span className="bg-muted px-1.5 py-0.5 rounded-md text-xs">
					x{parseFloat(Number(prepaidQuantity).toFixed(2))}
				</span>
			);
		}

		return null;
	};

	const showPrepaidOutside = isPrepaid && form && featureId && !hasEditableEdit;
	const inputQuantity = prepaidQuantity ?? 0;
	const billingUnitStep = item.billing_units ?? 1;
	const { roundedQuantity, normalizedBillingUnits, shouldShowRoundingHint } =
		getPrepaidQuantityTooltipData({
			inputQuantity,
			billingUnits: billingUnitStep,
		});
	const showDebouncedOffUnitRing = useDebounce({
		value: shouldShowRoundingHint,
		delayMs: 200,
	});
	const showPrepaidRowTooltip =
		!isDeleted && showPrepaidOutside && !isEditingQuantity;
	const shouldShowRightControlRing =
		showPrepaidOutside && showDebouncedOffUnitRing;

	const handleRowClick = () => {
		if (hasMultipleEdits) setIsAccordionOpen(!isAccordionOpen);
	};

	const handleRowKeyDown = (e: React.KeyboardEvent) => {
		if (hasMultipleEdits && (e.key === "Enter" || e.key === " ")) {
			e.preventDefault();
			setIsAccordionOpen(!isAccordionOpen);
		}
	};

	const rowContent = (
		<div className="flex items-center gap-2">
			<div
				role={hasMultipleEdits ? "button" : undefined}
				tabIndex={hasMultipleEdits ? 0 : undefined}
				className={cn(
					"flex items-center flex-1 min-w-0 h-10 px-3 rounded-xl input-base",
					rowRingClass,
					hasMultipleEdits && "cursor-pointer",
				)}
				onClick={handleRowClick}
				onKeyDown={handleRowKeyDown}
			>
				<div className="flex flex-row items-center flex-1 gap-2 min-w-0 overflow-hidden">
					<div className="flex flex-row items-center gap-1 shrink-0">
						<PlanFeatureIcon item={item} position="left" />
						<CustomDotIcon />
						<PlanFeatureIcon item={item} position="right" />
					</div>
					<p className="whitespace-nowrap truncate flex-1 min-w-0">
						<span className={cn("text-body", !hasFeatureName && "text-t4!")}>
							{displayText}
						</span>
						<span className="text-body-secondary">
							{" "}
							{display.secondary_text}
						</span>
					</p>
				</div>

				<div className="flex items-center gap-2 shrink-0">
					{renderRowIndicator()}
				</div>
			</div>

			{!isDeleted &&
				(showPrepaidOutside || hasEditableEdit) &&
				form &&
				featureId && (
					<motion.div
						layout
						transition={FAST_TRANSITION}
						className={cn(
							"flex items-center h-10 px-3 rounded-xl input-base w-fit shrink-0 gap-2 overflow-hidden",
							shouldShowRightControlRing &&
								"ring-1 ring-inset ring-amber-500/50",
						)}
					>
						<AnimatePresence mode="popLayout" initial={false}>
							{isEditingQuantity ? (
								<motion.div
									key="edit"
									layout
									initial={{ opacity: 0, x: 10 }}
									animate={{ opacity: 1, x: 0 }}
									exit={{ opacity: 0, x: -10 }}
									transition={FAST_TRANSITION}
									className="flex items-center gap-2"
								>
									<form.AppField name={`prepaidOptions.${featureId}`}>
										{(field) => (
											<field.QuantityField
												label=""
												min={0}
												step={billingUnitStep}
												hideFieldInfo
											/>
										)}
									</form.AppField>
									<IconButton
										icon={<CheckIcon size={14} />}
										variant="skeleton"
										size="sm"
										className="text-green-600 dark:text-green-500 hover:text-green-700! dark:hover:text-green-400! hover:bg-black/5 dark:hover:bg-white/10"
										onClick={() => setIsEditingQuantity(false)}
									/>
								</motion.div>
							) : (
								<motion.div
									key="display"
									layout
									initial={{ opacity: 0, x: -10 }}
									animate={{ opacity: 1, x: 0 }}
									exit={{ opacity: 0, x: 10 }}
									transition={FAST_TRANSITION}
									className="flex items-center gap-2"
								>
									<span className="text-sm tabular-nums text-t3">
										x{inputQuantity}
									</span>
									<IconButton
										icon={<PencilSimpleIcon size={14} />}
										variant="skeleton"
										size="sm"
										className="text-t4 hover:text-t2 hover:bg-muted"
										onClick={() => setIsEditingQuantity(true)}
									/>
								</motion.div>
							)}
						</AnimatePresence>
					</motion.div>
				)}
		</div>
	);
	const prepaidTooltipContent = (
		<div className="flex flex-col gap-1">
			<p>Quantity is exclusive of included usage.</p>
			{shouldShowRoundingHint && (
				<p>
					Rounded up to {roundedQuantity} to match {normalizedBillingUnits}-unit
					billing.
				</p>
			)}
		</div>
	);

	return (
		<div className="flex flex-col">
			<ConditionalTooltip
				enabled={!!showPrepaidRowTooltip}
				content={prepaidTooltipContent}
				contentClassName="max-w-(--radix-tooltip-trigger-width)"
			>
				{rowContent}
			</ConditionalTooltip>

			{!isDeleted && hasMultipleEdits && (
				<div
					className={cn(
						"grid transition-[grid-template-rows] duration-200 ease-out",
						isAccordionOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
					)}
				>
					<div className="overflow-hidden">
						<div className="flex flex-col gap-2 pt-2 pl-8">
							{edits.map((edit) => (
								<EditRow key={edit.id} edit={edit} />
							))}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
