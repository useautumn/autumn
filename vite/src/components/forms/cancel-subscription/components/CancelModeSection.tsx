import { CusProductStatus } from "@autumn/shared";
import { CalendarIcon, LightningIcon } from "@phosphor-icons/react";
import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";
import { PanelButton } from "@/components/v2/buttons/PanelButton";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";

export function CancelModeSection() {
	const { form, formValues, formContext } = useUpdateSubscriptionFormContext();
	const { customerProduct } = formContext;

	const isDefault = customerProduct.product.is_default;
	const isScheduled = customerProduct.status === CusProductStatus.Scheduled;
	const hasSubscription =
		customerProduct.subscription_ids &&
		customerProduct.subscription_ids.length > 0;

	const canChooseCancelMode = !isScheduled && !isDefault && !!hasSubscription;

	if (!canChooseCancelMode) return null;

	const cancelAction = formValues.cancelAction ?? "cancel_end_of_cycle";

	return (
		<SheetSection title="Cancellation" withSeparator>
			<div className="space-y-4">
				<div className="flex w-full items-center gap-4">
					<PanelButton
						isSelected={cancelAction === "cancel_end_of_cycle"}
						onClick={() =>
							form.setFieldValue("cancelAction", "cancel_end_of_cycle")
						}
						icon={<CalendarIcon size={18} weight="duotone" />}
					/>
					<div className="flex-1">
						<div className="text-body-highlight mb-1">End of billing cycle</div>
						<div className="text-body-secondary leading-tight">
							Customer keeps access until their current period ends.
						</div>
					</div>
				</div>

				<div className="flex w-full items-center gap-4">
					<PanelButton
						isSelected={cancelAction === "cancel_immediately"}
						onClick={() =>
							form.setFieldValue("cancelAction", "cancel_immediately")
						}
						icon={<LightningIcon size={18} weight="duotone" />}
					/>
					<div className="flex-1">
						<div className="text-body-highlight mb-1">Cancel immediately</div>
						<div className="text-body-secondary leading-tight">
							Access ends now, unused time may be credited.
						</div>
					</div>
				</div>
			</div>
		</SheetSection>
	);
}
