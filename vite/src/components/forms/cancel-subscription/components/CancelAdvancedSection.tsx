import { ProhibitIcon } from "@phosphor-icons/react";
import {
	AdvancedSection,
	AdvancedToggleRow,
} from "@/components/forms/shared/advanced-section";
import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";
import { IconCheckbox } from "@/components/v2/checkboxes/IconCheckbox";

export function CancelAdvancedSection() {
	const { form, formValues } = useUpdateSubscriptionFormContext();
	const { noBillingChanges } = formValues;

	return (
		<AdvancedSection
			hasCustomSettings={noBillingChanges}
			customSettingsTooltip={noBillingChanges ? "No Billing Changes" : ""}
		>
			<AdvancedToggleRow label="No Billing Changes">
				<IconCheckbox
					icon={<ProhibitIcon />}
					iconOrientation="left"
					variant="secondary"
					size="sm"
					checked={noBillingChanges}
					onCheckedChange={(checked) => {
						form.setFieldValue("noBillingChanges", checked);
						if (checked) form.setFieldValue("billingBehavior", null);
					}}
				>
					{noBillingChanges ? "On" : "Off"}
				</IconCheckbox>
			</AdvancedToggleRow>
		</AdvancedSection>
	);
}
