import { ProhibitIcon } from "@phosphor-icons/react";
import {
	AdvancedSection,
	AdvancedToggleRow,
} from "@/components/forms/shared/advanced-section";
import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";
import { IconCheckbox } from "@/components/v2/checkboxes/IconCheckbox";
import { cn } from "@/lib/utils";

export function CancelAdvancedSection() {
	const { form, formValues } = useUpdateSubscriptionFormContext();
	const { noBillingChanges, refundBehavior, refundAmount } = formValues;

	const showRefundAmount = refundBehavior === "refund";

	return (
		<AdvancedSection
			hasCustomSettings={noBillingChanges || showRefundAmount}
			customSettingsTooltip={
				noBillingChanges
					? "No Billing Changes"
					: showRefundAmount
						? `Refund: ${refundAmount === "full" ? "Full" : "Prorated"}`
						: ""
			}
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

			{showRefundAmount && (
				<AdvancedToggleRow label="Refund Amount">
					<>
						<IconCheckbox
							variant="secondary"
							size="sm"
							checked={refundAmount === "prorated"}
							onCheckedChange={() =>
								form.setFieldValue("refundAmount", "prorated")
							}
							className={cn(
								"min-w-[76px] px-2 text-xs rounded-r-none",
								refundAmount !== "prorated" && "border-r-0",
							)}
						>
							Prorated
						</IconCheckbox>
						<IconCheckbox
							variant="secondary"
							size="sm"
							checked={refundAmount === "full"}
							onCheckedChange={() => form.setFieldValue("refundAmount", "full")}
							className={cn(
								"min-w-[76px] px-2 text-xs rounded-l-none",
								refundAmount !== "full" && "border-l-0",
							)}
						>
							Full
						</IconCheckbox>
					</>
				</AdvancedToggleRow>
			)}
		</AdvancedSection>
	);
}
