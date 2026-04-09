import {
	AdvancedSection,
	ConfigRow,
} from "@/components/forms/shared/advanced-section";
import { Switch } from "@/components/ui/switch";
import { useUpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";

export function UpdateSubscriptionAdvancedSection() {
	const { form, formValues } = useUpdateSubscriptionFormContext();
	const { billingBehavior } = formValues;

	const isProrate = billingBehavior !== "none";

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
		</AdvancedSection>
	);
}
