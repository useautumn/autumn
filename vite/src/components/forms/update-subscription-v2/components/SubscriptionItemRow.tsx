import {
	getProductItemDisplay,
	type ProductItem,
	roundUsageToNearestBillingUnit,
	UsageModel,
} from "@autumn/shared";
import { CheckIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { UseAttachForm } from "@/components/forms/attach-v2/hooks/useAttachForm";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { ConditionalTooltip } from "@/components/v2/tooltips/ConditionalTooltip";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { PlanFeatureIcon } from "@/views/products/plan/components/plan-card/PlanFeatureIcon";
import { CustomDotIcon } from "@/views/products/plan/components/plan-card/PlanFeatureRow";
import { FAST_TRANSITION } from "../constants/animationConstants";
import type { UseUpdateSubscriptionForm } from "../hooks/useUpdateSubscriptionForm";

interface SubscriptionItemRowProps {
	item: ProductItem;
	hasChanges?: boolean;
	form?: UseUpdateSubscriptionForm | UseAttachForm;
	featureId?: string;
	prepaidQuantity?: number | null;
	isDeleted?: boolean;
	isCreated?: boolean;
	readOnly?: boolean;
}

function usePrepaidDisplayState({
	item,
	prepaidQuantity,
	isPrepaid,
	isDeleted,
	form,
	featureId,
	isEditingQuantity,
}: {
	item: ProductItem;
	prepaidQuantity: number | null | undefined;
	isPrepaid: boolean;
	isDeleted: boolean;
	form: SubscriptionItemRowProps["form"];
	featureId: string | undefined;
	isEditingQuantity: boolean;
}) {
	const inputQuantity = prepaidQuantity ?? undefined;
	const billingUnitStep = item.billing_units ?? 1;

	const normalizedBillingUnits = billingUnitStep > 0 ? billingUnitStep : 1;
	const roundedQuantity = roundUsageToNearestBillingUnit({
		usage: inputQuantity ?? 0,
		billingUnits: normalizedBillingUnits,
	});
	const shouldShowRoundingHint =
		inputQuantity !== undefined &&
		normalizedBillingUnits > 1 &&
		roundedQuantity !== inputQuantity;

	const showDebouncedOffUnitRing = useDebounce({
		value: shouldShowRoundingHint,
		delayMs: 200,
	});

	const showPrepaidControl = isPrepaid && !!form && !!featureId;
	const showTooltip = !isDeleted && showPrepaidControl && !isEditingQuantity;
	const showRightControlRing = showPrepaidControl && showDebouncedOffUnitRing;

	return {
		inputQuantity,
		billingUnitStep,
		roundedQuantity,
		normalizedBillingUnits,
		shouldShowRoundingHint,
		showPrepaidControl,
		showTooltip,
		showRightControlRing,
	};
}

function PrepaidQuantityControl({
	readOnly,
	form,
	featureId,
	inputQuantity,
	step,
	showRing,
	isEditing,
	onEditingChange,
}: {
	readOnly: boolean;
	form: UseUpdateSubscriptionForm | UseAttachForm;
	featureId: string;
	inputQuantity: number | undefined;
	step: number;
	showRing: boolean;
	isEditing: boolean;
	onEditingChange: (editing: boolean) => void;
}) {
	const displayText = inputQuantity !== undefined ? `x${inputQuantity}` : "—";

	if (readOnly) {
		return (
			<div className="flex items-center h-10 px-3 rounded-xl input-base w-fit shrink-0">
				<span className="text-sm tabular-nums text-t3">{displayText}</span>
			</div>
		);
	}

	return (
		<motion.div
			layout
			transition={FAST_TRANSITION}
			className={cn(
				"flex items-center h-10 px-3 rounded-xl input-base w-fit shrink-0 gap-2 overflow-hidden",
				showRing && "ring-1 ring-inset ring-amber-500/50",
			)}
		>
			<AnimatePresence mode="popLayout" initial={false}>
				{isEditing ? (
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
									step={step}
									hideFieldInfo
								/>
							)}
						</form.AppField>
						<IconButton
							icon={<CheckIcon size={14} />}
							variant="skeleton"
							size="sm"
							className="text-green-600 dark:text-green-500 hover:text-green-700! dark:hover:text-green-400! hover:bg-black/5 dark:hover:bg-white/10"
							onClick={() => onEditingChange(false)}
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
						{inputQuantity !== undefined && (
							<span className="text-sm tabular-nums text-t3">
								{displayText}
							</span>
						)}
						<IconButton
							icon={<PencilSimpleIcon size={14} />}
							variant="skeleton"
							size="sm"
							className="text-t4 hover:text-t2 hover:bg-muted"
							onClick={() => onEditingChange(true)}
						/>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
}

const ITEM_STATE_CONFIG = {
	new: { color: "bg-green-500", label: "New feature" },
	changed: { color: "bg-amber-500", label: "Changed" },
	removed: { color: "bg-red-500", label: "Removed" },
} as const;

function ItemStatusDot({ state }: { state: keyof typeof ITEM_STATE_CONFIG }) {
	const { color, label } = ITEM_STATE_CONFIG[state];
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className={cn("size-2 rounded-full shrink-0", color)} />
			</TooltipTrigger>
			<TooltipContent side="top">{label}</TooltipContent>
		</Tooltip>
	);
}

export function SubscriptionItemRow({
	item,
	hasChanges = false,
	form,
	featureId,
	prepaidQuantity,
	isDeleted = false,
	isCreated = false,
	readOnly = false,
}: SubscriptionItemRowProps) {
	const { org } = useOrg();
	const { features } = useFeaturesQuery();
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

	const prepaid = usePrepaidDisplayState({
		item,
		prepaidQuantity,
		isPrepaid,
		isDeleted,
		form,
		featureId,
		isEditingQuantity,
	});

	const renderRowIndicator = () => {
		if (isDeleted) return <ItemStatusDot state="removed" />;
		if (isCreated) return <ItemStatusDot state="new" />;
		if (hasChanges) return <ItemStatusDot state="changed" />;

		if (!isPrepaid && prepaidQuantity) {
			return (
				<span className="bg-muted px-1.5 py-0.5 rounded-md text-xs">
					x{parseFloat(Number(prepaidQuantity).toFixed(2))}
				</span>
			);
		}

		return null;
	};

	const rowContent = (
		<div className="flex items-center gap-2">
			<div
				className={cn(
					"flex items-center flex-1 min-w-0 h-10 px-3 rounded-xl input-base gap-2",
					!readOnly && isDeleted && "opacity-50",
				)}
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

			{!isDeleted && prepaid.showPrepaidControl && form && featureId && (
				<PrepaidQuantityControl
					readOnly={readOnly}
					form={form}
					featureId={featureId}
					inputQuantity={prepaid.inputQuantity}
					step={prepaid.billingUnitStep}
					showRing={prepaid.showRightControlRing}
					isEditing={isEditingQuantity}
					onEditingChange={setIsEditingQuantity}
				/>
			)}
		</div>
	);

	const prepaidTooltipContent = (
		<div className="flex flex-col gap-1">
			<p>Quantity includes included usage.</p>
			{prepaid.shouldShowRoundingHint && (
				<p>
					Rounded up to {prepaid.roundedQuantity} to match{" "}
					{prepaid.normalizedBillingUnits}-unit billing.
				</p>
			)}
		</div>
	);

	return (
		<ConditionalTooltip
			enabled={!!prepaid.showTooltip}
			content={prepaidTooltipContent}
			contentClassName="max-w-(--radix-tooltip-trigger-width)"
		>
			{rowContent}
		</ConditionalTooltip>
	);
}
