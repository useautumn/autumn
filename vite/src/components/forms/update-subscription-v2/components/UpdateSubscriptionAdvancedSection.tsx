import {
	AdvancedSection,
	ConfigRow,
} from "@/components/forms/shared/advanced-section";
import { Switch } from "@/components/ui/switch";
import { useUpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";

export function UpdateSubscriptionAdvancedSection() {
	const { form, formValues, formContext } =
		useUpdateSubscriptionFormContext();
	const { billingBehavior, resetBillingCycle } = formValues;
	const { customerProduct } = formContext;

	const hasActiveSubscription =
		(customerProduct.subscription_ids?.length ?? 0) > 0;
	const isProrate = billingBehavior !== "none";

	if (!hasActiveSubscription) return null;

	return (
		<AdvancedSection>
			<ConfigRow
				title="Prorate Changes"
				description="Prorate price differences when changing plans mid-cycle"
				action={
					<Switch
						checked={isProrate}
						onCheckedChange={(checked) =>
							form.setFieldValue("billingBehavior", checked ? null : "none")
						}
					/>
				}
			/>
			<ConfigRow
				title="Reset Billing Cycle"
				description="Restart the billing cycle from today"
				action={
					<Switch
						checked={resetBillingCycle}
						onCheckedChange={(checked) =>
							form.setFieldValue("resetBillingCycle", !!checked)
						}
					/>
				}
			/>
		</AdvancedSection>
	);
}
