import type { FreeTrialDuration } from "@autumn/shared";
import type { UseAttachForm } from "@/components/forms/attach-v2/hooks/useAttachForm";
import { TRIAL_DURATION_OPTIONS } from "@/components/forms/update-subscription-v2/constants/trialConstants";
import type { UseUpdateSubscriptionForm } from "@/components/forms/update-subscription-v2/hooks/useUpdateSubscriptionForm";
import { Switch } from "@/components/ui/switch";
import { TextCheckbox } from "@/components/v2/checkboxes/TextCheckbox";
import { ConfigRow } from "./ConfigRow";

const DEFAULT_TRIAL_LENGTH = 7;

export function FreeTrialConfigRow({
	form,
	expanded,
	checked,
	trialCardRequired,
	trialOnEnd,
	hasActiveSubscription = false,
	onToggle,
}: {
	form: UseAttachForm | UseUpdateSubscriptionForm;
	expanded: boolean;
	checked: boolean;
	trialCardRequired: boolean;
	trialOnEnd?: "bill" | "revert";
	hasActiveSubscription?: boolean;
	onToggle: (enabled: boolean) => void;
}) {
	const isRevert = trialOnEnd === "revert";
	const supportsRevert =
		hasActiveSubscription && "trialOnEnd" in form.store.state.values;

	return (
		<ConfigRow
			title="Free Trial"
			description="Let the customer try the plan before being charged"
			expanded={expanded}
			action={<Switch checked={checked} onCheckedChange={onToggle} />}
		>
			<div className="flex flex-col gap-3">
				<div className="flex items-center gap-2">
					<form.AppField name="trialLength">
						{(field) => (
							<field.NumberField
								label=""
								placeholder={String(DEFAULT_TRIAL_LENGTH)}
								min={1}
								className="w-20"
								inputClassName="placeholder:opacity-50"
								hideFieldInfo
							/>
						)}
					</form.AppField>
					<form.AppField name="trialDuration">
						{(field) => (
							<field.SelectField
								label=""
								placeholder="Days"
								options={
									TRIAL_DURATION_OPTIONS as unknown as {
										label: string;
										value: FreeTrialDuration;
									}[]
								}
								className="w-28"
								hideFieldInfo
							/>
						)}
					</form.AppField>
					{!supportsRevert && (
						<div className="mx-2">
							<TextCheckbox
								checked={trialCardRequired}
								onCheckedChange={(checked) =>
									form.setFieldValue(
										"trialCardRequired",
										checked as boolean,
									)
								}
							>
								Card Required
							</TextCheckbox>
						</div>
					)}
				</div>
				{supportsRevert && (
					<TextCheckbox
						checked={isRevert}
						onCheckedChange={(checked) => {
							const revert = checked as boolean;
							form.setFieldValue(
								"trialOnEnd" as keyof typeof form.store.state.values,
								(revert ? "revert" : "bill") as never,
							);
							if (revert) {
								form.setFieldValue("trialCardRequired", false);
							}
						}}
					>
						Revert to previous plan after trial ends
					</TextCheckbox>
				)}
			</div>
		</ConfigRow>
	);
}

FreeTrialConfigRow.DEFAULT_TRIAL_LENGTH = DEFAULT_TRIAL_LENGTH;
