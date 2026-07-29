import {
	type ProductItem,
	roundUsageToNearestBillingUnit,
	UsageModel,
} from "@autumn/shared";
import { useState } from "react";
import type { UseAttachForm } from "@/components/forms/attach-v2/hooks/useAttachForm";
import { QuantityEditControl } from "@/components/forms/shared/plan-items/QuantityEditControl";
import { ItemStatusDot } from "@/components/v2/ItemStatusDot";
import { PlanItemLabel } from "@/components/v2/PlanItemLabel";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import type { UseUpdateSubscriptionForm } from "../hooks/useUpdateSubscriptionForm";

interface SubscriptionItemRowProps {
	item: ProductItem;
	form?: UseUpdateSubscriptionForm | UseAttachForm;
	featureId?: string;
	prepaidQuantity?: number | null;
	isDeleted?: boolean;
	isCreated?: boolean;
	readOnly?: boolean;
	currency?: string;
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
	return (
		<QuantityEditControl
			readOnly={readOnly}
			displayText={
				inputQuantity !== undefined ? `x${inputQuantity}` : undefined
			}
			showRing={showRing}
			isEditing={isEditing}
			onEditingChange={onEditingChange}
		>
			<form.AppField name={`prepaidOptions.${featureId}`}>
				{(field) => (
					<field.QuantityField label="" min={0} step={step} hideFieldInfo />
				)}
			</form.AppField>
		</QuantityEditControl>
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
	currency,
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
					<PlanItemLabel currency={currency} item={item} />
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
