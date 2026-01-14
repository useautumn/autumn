import {
	FreeTrialDuration,
	type FullCusProduct,
	isCustomerProductTrialing,
} from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
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

				{/* Remove Trial Option (only if currently trialing) */}
				{isCurrentlyTrialing && (
					<form.AppField name="removeTrial">
						{(field) => (
							<field.CheckboxField
								label="Remove trial immediately"
								labelClassName="text-sm text-red-400"
								hideFieldInfo
							/>
						)}
					</form.AppField>
				)}

				{/* Set New Trial (hidden if removing) */}
				{!removeTrial && (
					<>
						<div className="flex gap-2 items-end">
							<form.AppField name="trialLength">
								{(field) => (
									<field.NumberField
										label="Trial Length"
										placeholder="e.g. 7"
										min={1}
										className="w-24"
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
									/>
								)}
							</form.AppField>
						</div>

						<form.AppField name="trialCardRequired">
							{(field) => (
								<field.CheckboxField
									label="Require payment method"
									hideFieldInfo
								/>
							)}
						</form.AppField>
					</>
				)}
			</div>
		</SheetSection>
	);
}
