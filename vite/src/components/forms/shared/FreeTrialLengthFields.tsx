import { FreeTrialDuration } from "@autumn/shared";
import { TRIAL_DURATION_OPTIONS } from "@/components/forms/update-subscription-v2/constants/trialConstants";
import { withFieldGroup } from "@/hooks/form/form";
import { DEFAULT_TRIAL_LENGTH } from "./utils/freeTrialFormValues";

const trialLengthDefaults: {
	trialLength: number | null;
	trialDuration: FreeTrialDuration;
} = {
	trialLength: null,
	trialDuration: FreeTrialDuration.Day,
};

const NO_EDIT_HANDLER: { onEdit?: () => void } = {};

/** Length and unit inputs of a free trial; `onEdit` fires on user input only. */
export const FreeTrialLengthFields = withFieldGroup({
	defaultValues: trialLengthDefaults,
	props: NO_EDIT_HANDLER,
	render: function FreeTrialLengthFieldsRender({ group, onEdit }) {
		const listeners = { onChange: () => onEdit?.() };
		return (
			<>
				<group.AppField name="trialLength" listeners={listeners}>
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
				</group.AppField>
				<group.AppField name="trialDuration" listeners={listeners}>
					{(field) => (
						<field.SelectField
							label=""
							placeholder="Days"
							options={[...TRIAL_DURATION_OPTIONS]}
							className="w-28"
							hideFieldInfo
						/>
					)}
				</group.AppField>
			</>
		);
	},
});

export const FREE_TRIAL_LENGTH_FIELDS = {
	trialLength: "trialLength",
	trialDuration: "trialDuration",
} as const;
