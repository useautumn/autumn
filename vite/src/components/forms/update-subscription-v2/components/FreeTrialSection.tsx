import {
	FreeTrialDuration,
	type FullCusProduct,
	isCustomerProductTrialing,
} from "@autumn/shared";
import { XCircleIcon } from "@phosphor-icons/react";
import { useStore } from "@tanstack/react-form";
import { IconCheckbox } from "@/components/v2/checkboxes/IconCheckbox";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import type { UseUpdateSubscriptionForm } from "../hooks/useUpdateSubscriptionForm";

interface FreeTrialSectionProps {
	form: UseUpdateSubscriptionForm;
	customerProduct: FullCusProduct;
}

export function FreeTrialSection({
	form,
	customerProduct,
}: FreeTrialSectionProps) {
	const isCurrentlyTrialing = isCustomerProductTrialing(customerProduct);
	const removeTrial = useStore(form.store, (state) => state.values.removeTrial);

	return (
		<SheetSection title="Free Trial" withSeparator>
			<div className="flex flex-col gap-3">
				{/* Current Status */}
				<div className="flex items-center gap-2 text-sm">
					<span className="text-t3">Status:</span>
					{isCurrentlyTrialing && customerProduct.trial_ends_at ? (
						<span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
							Trialing until{" "}
							{new Date(customerProduct.trial_ends_at).toLocaleDateString()}
						</span>
					) : (
						<span className="text-xs px-2 py-0.5 bg-muted text-t3 rounded">
							Not Trialing
						</span>
					)}
				</div>

				{/* Trial Length and Remove Trial */}
				<div className="flex gap-2 items-end">
					<form.AppField name="trialLength">
						{(field) => (
							<field.NumberField
								label="Trial Length"
								placeholder="e.g. 7"
								min={1}
								className="min-w-24"
								disabled={removeTrial}
							/>
						)}
					</form.AppField>
					<form.AppField name="trialDuration">
						{(field) => (
							<field.SelectField
								label=""
								placeholder="Duration"
								className="w-full"
								options={[
									{ label: "Days", value: FreeTrialDuration.Day },
									{ label: "Months", value: FreeTrialDuration.Month },
									{ label: "Years", value: FreeTrialDuration.Year },
								]}
								hideFieldInfo
								disabled={removeTrial}
							/>
						)}
					</form.AppField>
					{isCurrentlyTrialing && (
						<form.AppField name="removeTrial">
							{(field) => (
								<IconCheckbox
									icon={<XCircleIcon />}
									iconOrientation="left"
									variant="secondary"
									size="default"
									checked={field.state.value}
									onCheckedChange={field.handleChange}
									className={
										field.state.value
											? "text-red-500! border-red-500"
											: "text-t4"
									}
								>
									Remove trial
								</IconCheckbox>
							)}
						</form.AppField>
					)}
				</div>
			</div>
		</SheetSection>
	);
}
