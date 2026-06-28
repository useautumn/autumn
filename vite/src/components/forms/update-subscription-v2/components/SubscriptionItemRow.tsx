import {
	type ProductItem,
	roundUsageToNearestBillingUnit,
	UsageModel,
} from "@autumn/shared";
import { IconButton } from "@autumn/ui";
import { CheckIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { UseAttachForm } from "@/components/forms/attach-v2/hooks/useAttachForm";
import { ItemStatusDot } from "@/components/v2/ItemStatusDot";
import { PlanItemLabel } from "@/components/v2/PlanItemLabel";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { FAST_TRANSITION } from "../constants/animationConstants";
import type { UseUpdateSubscriptionForm } from "../hooks/useUpdateSubscriptionForm";

interface SubscriptionItemRowProps {
	item: ProductItem;
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
	form,
	featureId,
}: {
	item: ProductItem;
	prepaidQuantity: number | null | undefined;
	isPrepaid: boolean;
	form: SubscriptionItemRowProps["form"];
	featureId: string | undefined;
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
	const showRightControlRing = showPrepaidControl && showDebouncedOffUnitRing;

	return {
		inputQuantity,
		billingUnitStep,
		showPrepaidControl,
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
			<div className="flex items-center py-1 w-fit shrink-0">
				<span className="text-sm tabular-nums text-tertiary-foreground">
					{displayText}
				</span>
			</div>
		);
	}

	return (
		<motion.div
			layout
			transition={FAST_TRANSITION}
			className={cn(
				"flex items-center py-1 w-fit shrink-0 gap-2 overflow-hidden",
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
							<span className="text-sm tabular-nums text-tertiary-foreground">
								{displayText}
							</span>
						)}
						<IconButton
							icon={<PencilSimpleIcon size={14} />}
							variant="secondary"
							size="sm"
							iconOrientation="center"
							onClick={() => onEditingChange(true)}
						/>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
}

export function SubscriptionItemRow({
	item,
	form,
	featureId,
	prepaidQuantity,
	isDeleted = false,
	isCreated = false,
	readOnly = false,
}: SubscriptionItemRowProps) {
	const [isEditingQuantity, setIsEditingQuantity] = useState(false);

	const isPrepaid = item.usage_model === UsageModel.Prepaid;

	const prepaid = usePrepaidDisplayState({
		item,
		prepaidQuantity,
		isPrepaid,
		form,
		featureId,
	});

	const renderRowIndicator = () => {
		if (isDeleted) return <ItemStatusDot state="removed" />;
		if (isCreated) return <ItemStatusDot state="new" />;

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
					"flex items-center flex-1 min-w-0 gap-2 py-1",
					!readOnly && isDeleted && "opacity-50",
				)}
			>
				<div className="flex flex-row items-center flex-1 gap-2 min-w-0 overflow-hidden">
					<PlanItemLabel item={item} />
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

	return rowContent;
}
