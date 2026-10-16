import type { ApprovalAction } from "../approvalsStub";
import { ChipMultiSelect } from "./ChipMultiSelect";
import {
	actionAreas,
	areaLabel,
	ruleArea,
	toggleAction,
	whoOnlyCaption,
} from "./ruleActions";

export const RuleActionsPicker = ({
	actions,
	onChange,
}: {
	actions: ApprovalAction[];
	onChange: (actions: ApprovalAction[]) => void;
}) => {
	const area = ruleArea({ actions });
	const caption = whoOnlyCaption({ actions });

	return (
		<>
			<ChipMultiSelect
				ariaLabel="Actions"
				placeholder="Choose actions"
				value={actions}
				onToggle={(action) =>
					onChange(toggleAction({ actions, action: action as ApprovalAction }))
				}
				lockNote={
					area && `One area per rule. Clear ${areaLabel(area)} to pick another.`
				}
				groups={actionAreas({ actions }).map((option) => ({
					label: option.label,
					options: option.actions,
					locked: option.locked,
				}))}
			/>
			{caption && <p className="text-subtle text-xs">{caption}</p>}
		</>
	);
};
