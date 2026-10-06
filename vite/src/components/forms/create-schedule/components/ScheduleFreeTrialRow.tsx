import { format } from "date-fns";
import { FreeTrialConfigRow } from "@/components/forms/shared/FreeTrialConfigRow";
import {
	FREE_TRIAL_LENGTH_FIELDS,
	FreeTrialLengthFields,
} from "@/components/forms/shared/FreeTrialLengthFields";
import { applyFreeTrialFormValues } from "@/components/forms/shared/utils/freeTrialForm";
import { toggledFreeTrialFormValues } from "@/components/forms/shared/utils/freeTrialFormValues";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";

export function ScheduleFreeTrialRow() {
	const { form, formValues, products, currentTrial } =
		useCreateScheduleFormContext();
	const { trialEnabled, trialLength, trialCardRequired, phases } = formValues;

	const firstPhaseProductIds = new Set(
		phases[0]?.plans.map((plan) => plan.productId),
	);
	const catalogFreeTrial = products.find(
		(product) => firstPhaseProductIds.has(product.id) && product.free_trial,
	)?.free_trial;
	const endsCurrentTrial = currentTrial !== null && !trialEnabled;
	const markTrialEdited = () => form.setFieldValue("trialEdited", true);

	return (
		<div className="flex flex-col gap-2">
			<FreeTrialConfigRow
				form={form}
				lengthFields={
					<FreeTrialLengthFields
						form={form}
						fields={FREE_TRIAL_LENGTH_FIELDS}
						onEdit={markTrialEdited}
					/>
				}
				description="Let the customer try the schedule before being charged"
				expanded={trialEnabled}
				checked={trialEnabled}
				trialCardRequired={trialCardRequired}
				onEdit={markTrialEdited}
				onToggle={(enabled) =>
					applyFreeTrialFormValues({
						form,
						values: toggledFreeTrialFormValues({
							enabled,
							trialLength,
							catalogFreeTrial,
						}),
					})
				}
			/>
			{endsCurrentTrial && (
				<span className="text-xs text-tertiary-foreground">
					Currently trialing until {format(currentTrial.trialEndsAt, "MMM d")}.
					Turning this off ends the trial now and starts billing.
				</span>
			)}
		</div>
	);
}
