import { CalendarIcon, LightningIcon, ProhibitIcon } from "@phosphor-icons/react";
import {
	AdvancedSection,
	AdvancedToggleRow,
} from "@/components/forms/shared/advanced-section";
import { IconCheckbox } from "@/components/v2/checkboxes/IconCheckbox";
import { cn } from "@/lib/utils";
import { useUpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";

export function UpdateSubscriptionAdvancedSection() {
	const { form, formValues } = useUpdateSubscriptionFormContext();
	const { billingBehavior, noBillingChanges } = formValues;

	const isProrate = billingBehavior !== "none";
	const isNextCycleOnly = billingBehavior === "none";

	const hasCustomSettings = isNextCycleOnly || noBillingChanges;
	const customSettingsLabels = [
		isNextCycleOnly && "Proration: Next Cycle Only",
		noBillingChanges && "No Billing Changes",
	].filter(Boolean);
	const customSettingsTooltip = customSettingsLabels.join(", ");

	return (
		<AdvancedSection
			hasCustomSettings={hasCustomSettings}
			customSettingsTooltip={customSettingsTooltip}
		>
			<AdvancedToggleRow label="Proration Behaviour">
				<IconCheckbox
					icon={<LightningIcon />}
					iconOrientation="left"
					variant="secondary"
					size="sm"
					checked={isProrate}
					onCheckedChange={() => form.setFieldValue("billingBehavior", null)}
					className={cn("rounded-r-none", !isProrate && "border-r-0")}
				>
					Prorate
				</IconCheckbox>
				<IconCheckbox
					icon={<CalendarIcon />}
					iconOrientation="left"
					variant="secondary"
					size="sm"
					checked={isNextCycleOnly}
					onCheckedChange={() => form.setFieldValue("billingBehavior", "none")}
					className={cn("rounded-l-none", !isNextCycleOnly && "border-l-0")}
				>
					Next Cycle Only
				</IconCheckbox>
			</AdvancedToggleRow>

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
