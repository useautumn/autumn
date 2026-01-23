import { CusProductStatus } from "@autumn/shared";
import { CalendarIcon, LightningIcon } from "@phosphor-icons/react";
import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";
import {
	OptionCard,
	OptionCardContent,
	OptionCardDescription,
	OptionCardGroup,
	OptionCardIcon,
	OptionCardLabel,
} from "@/components/v2/selections/OptionCard";
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
			<OptionCardGroup>
				<OptionCard
					selected={cancelAction === "cancel_end_of_cycle"}
					onClick={() =>
						form.setFieldValue("cancelAction", "cancel_end_of_cycle")
					}
				>
					<OptionCardIcon>
						<CalendarIcon size={18} weight="duotone" />
					</OptionCardIcon>
					<OptionCardContent>
						<OptionCardLabel>End of billing cycle</OptionCardLabel>
						<OptionCardDescription>
							Customer keeps access until their current period ends
						</OptionCardDescription>
					</OptionCardContent>
				</OptionCard>
				<OptionCard
					selected={cancelAction === "cancel_immediately"}
					onClick={() =>
						form.setFieldValue("cancelAction", "cancel_immediately")
					}
				>
					<OptionCardIcon>
						<LightningIcon size={18} weight="duotone" />
					</OptionCardIcon>
					<OptionCardContent>
						<OptionCardLabel>Cancel immediately</OptionCardLabel>
						<OptionCardDescription>
							Access ends now, unused time may be credited
						</OptionCardDescription>
					</OptionCardContent>
				</OptionCard>
			</OptionCardGroup>
		</SheetSection>
	);
}
