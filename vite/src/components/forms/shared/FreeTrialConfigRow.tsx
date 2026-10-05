import type { TrialOnEnd } from "@autumn/shared";
import { Switch, TextCheckbox } from "@autumn/ui";
import type { ReactNode } from "react";
import { ConfigRow } from "./ConfigRow";
import { TrialOnEndSelect } from "./TrialOnEndSelect";
import type { FreeTrialForm } from "./utils/freeTrialForm";

/** `lengthFields` is the caller's `FreeTrialLengthFields`, bound to its own form type. */
export function FreeTrialConfigRow({
	form,
	lengthFields,
	expanded,
	checked,
	trialCardRequired,
	trialOnEnd,
	onTrialOnEndChange,
	onToggle,
	description = "Let the customer try the plan before being charged",
}: {
	form: FreeTrialForm;
	lengthFields: ReactNode;
	expanded: boolean;
	checked: boolean;
	trialCardRequired: boolean;
	trialOnEnd?: TrialOnEnd;
	onTrialOnEndChange?: (value: TrialOnEnd) => void;
	onToggle: (enabled: boolean) => void;
	description?: string;
}) {
	const showTrialOnEnd = !!onTrialOnEndChange;

	return (
		<ConfigRow
			title="Free Trial"
			description={description}
			expanded={expanded}
			action={<Switch checked={checked} onCheckedChange={onToggle} />}
		>
			<div className="flex flex-col gap-3">
				<div className="flex items-center gap-2">
					{lengthFields}
					{!showTrialOnEnd && (
						<div className="mx-2">
							<TextCheckbox
								checked={trialCardRequired}
								onCheckedChange={(checked) =>
									form.setFieldValue("trialCardRequired", checked === true)
								}
							>
								Card Required
							</TextCheckbox>
						</div>
					)}
				</div>
				{showTrialOnEnd && (
					<TrialOnEndSelect
						value={trialOnEnd ?? "revert"}
						onChange={(value) => {
							onTrialOnEndChange(value);
							if (value === "revert") {
								form.setFieldValue("trialCardRequired", false);
							}
						}}
					/>
				)}
			</div>
		</ConfigRow>
	);
}
