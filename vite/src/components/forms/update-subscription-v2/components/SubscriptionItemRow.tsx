import { type ProductItem, UsageModel } from "@autumn/shared";
import type { UseAttachForm } from "@/components/forms/attach-v2/hooks/useAttachForm";
import { PrepaidQuantityControl } from "@/components/forms/shared/plan-items/PrepaidQuantityControl";
import { ItemStatusDot } from "@/components/v2/ItemStatusDot";
import { PlanItemLabel } from "@/components/v2/PlanItemLabel";
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
	const isPrepaid = item.usage_model === UsageModel.Prepaid;
	const showPrepaidControl = isPrepaid && !!form && !!featureId;

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

			{!isDeleted && showPrepaidControl && form && featureId && (
				<PrepaidQuantityControl
					readOnly={readOnly}
					quantity={prepaidQuantity ?? undefined}
					billingUnits={item.billing_units}
				>
					<form.AppField name={`prepaidOptions.${featureId}`}>
						{(field) => (
							<field.QuantityField
								label=""
								min={0}
								step={item.billing_units ?? 1}
								hideFieldInfo
							/>
						)}
					</form.AppField>
				</PrepaidQuantityControl>
			)}
		</div>
	);

	return rowContent;
}
