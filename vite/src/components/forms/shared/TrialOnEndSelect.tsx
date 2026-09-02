import type { TrialOnEnd } from "@autumn/shared";
import {
	SearchableSelect,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { QuestionIcon } from "@phosphor-icons/react";
import { CheckIcon } from "lucide-react";

type TrialOnEndOption = {
	label: string;
	value: TrialOnEnd;
	tooltip?: string;
};

const TRIAL_ON_END_OPTIONS: TrialOnEndOption[] = [
	{ label: "Revert to previous plan", value: "revert" },
	{
		label: "Bill customer",
		value: "bill",
		tooltip:
			"This will add a trial to the stripe subscription. When the trial ends, the billing cycle will be reset and the customer will be charged in full",
	},
];

export function TrialOnEndSelect({
	value,
	onChange,
}: {
	value: TrialOnEnd;
	onChange: (value: TrialOnEnd) => void;
}) {
	return (
		<div className="flex items-center gap-2">
			<span className="text-sm font-semibold text-muted-foreground whitespace-nowrap">
				On trial end
			</span>
			<SearchableSelect
				value={value}
				onValueChange={(next) => onChange(next as TrialOnEnd)}
				options={TRIAL_ON_END_OPTIONS}
				getOptionValue={(option) => option.value}
				getOptionLabel={(option) => option.label}
				triggerClassName="w-56"
				renderOption={(option, isSelected) => (
					<>
						<span className="flex flex-1 items-center gap-1.5 min-w-0">
							<span className="truncate min-w-0">{option.label}</span>
							{option.tooltip && (
								<Tooltip>
									{/* The option row sets [&_svg]:pointer-events-none, so the icon
									    itself never sees a hover — the wrapper takes the trigger. */}
									<TooltipTrigger asChild>
										<span
											className="flex shrink-0 items-center cursor-help text-tertiary-foreground"
											onClick={(event) => event.stopPropagation()}
										>
											<QuestionIcon className="size-3.5" />
										</span>
									</TooltipTrigger>
									<TooltipContent className="max-w-64">
										{option.tooltip}
									</TooltipContent>
								</Tooltip>
							)}
						</span>
						{isSelected && <CheckIcon className="size-4 shrink-0" />}
					</>
				)}
			/>
		</div>
	);
}
