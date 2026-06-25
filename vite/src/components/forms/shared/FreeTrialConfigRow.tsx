import type { FreeTrialDuration, TrialOnEnd } from "@autumn/shared";
import { Switch, TextCheckbox } from "@autumn/ui";
import type { UseAttachForm } from "@/components/forms/attach-v2/hooks/useAttachForm";
import { TRIAL_DURATION_OPTIONS } from "@/components/forms/update-subscription-v2/constants/trialConstants";
import type { UseUpdateSubscriptionForm } from "@/components/forms/update-subscription-v2/hooks/useUpdateSubscriptionForm";
import { ConfigRow } from "./ConfigRow";

const DEFAULT_TRIAL_LENGTH = 7;

export function FreeTrialConfigRow({
	form,
	expanded,
	checked,
	trialCardRequired,
	trialOnEnd,
	onTrialOnEndChange,
	onToggle,
}: {
	form: UseAttachForm | UseUpdateSubscriptionForm;
	expanded: boolean;
	checked: boolean;
	trialCardRequired: boolean;
	trialOnEnd?: TrialOnEnd;
	onTrialOnEndChange?: (value: TrialOnEnd) => void;
	onToggle: (enabled: boolean) => void;
}) {
	const showRevert = !!onTrialOnEndChange;

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
					{!showRevert && (
						<div className="mx-2">
							<TextCheckbox
								checked={trialCardRequired}
								onCheckedChange={(checked) =>
									form.setFieldValue("trialCardRequired", checked as boolean)
								}
							>
								Card Required
							</TextCheckbox>
						</div>
					)}
				</div>
				{showRevert && (
					<TextCheckbox
						checked={trialOnEnd === "revert"}
						onCheckedChange={(checked) => {
							const revert = checked as boolean;
							onTrialOnEndChange(revert ? "revert" : "bill");
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
