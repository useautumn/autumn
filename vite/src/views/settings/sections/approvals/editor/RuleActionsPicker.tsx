import { ACTIONS, APPROVAL_AREAS, type ApprovalAction } from "@autumn/shared";
import { ChipMultiSelect } from "./ChipMultiSelect";
import {
	actionAreas,
	isDeferredAction,
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
	// A stored rule can still name a deferred action; keep its chip labelled.
	const deferred = actions
		.filter(isDeferredAction)
		.map((action) => ({ value: action, label: ACTIONS[action].label }));

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
					area &&
					`One area per rule. Clear ${APPROVAL_AREAS[area]} to pick another.`
				}
				groups={[
					...(deferred.length > 0
						? [{ label: "Not rule-controlled", options: deferred }]
						: []),
					...actionAreas({ actions }).map((option) => ({
						label: option.label,
						options: option.actions,
						locked: option.locked,
					})),
				]}
			/>
			{caption && <p className="text-subtle text-xs">{caption}</p>}
		</>
	);
};
