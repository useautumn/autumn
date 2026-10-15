import {
	ACTIONS,
	APPROVAL_AREAS,
	type ApprovalAction,
	type ApprovalArea,
	type WhenKey,
} from "@autumn/shared";

export type ActionAreaOption = {
	area: ApprovalArea;
	label: string;
	actions: { value: ApprovalAction; label: string }[];
	locked: boolean;
};

const ACTION_KEYS = Object.keys(ACTIONS) as ApprovalAction[];

// The board words who-only captions per area, or per action where the area also has conditions.
const WHO_ONLY_NOUNS: Partial<Record<ApprovalAction | ApprovalArea, string>> = {
	"customers.create": "customer creation",
	"rewards.create": "reward creation",
	catalog: "plan and feature edit",
	api_keys: "API key creation",
	migrations: "migration",
	members: "invite and role change",
};

export const ruleArea = ({ actions }: { actions: ApprovalAction[] }) =>
	actions.length > 0 ? ACTIONS[actions[0]].area : null;

/** The areas for the Can picker; once an action is picked, the other areas lock. */
export const actionAreas = ({
	actions,
}: {
	actions: ApprovalAction[];
}): ActionAreaOption[] => {
	const picked = ruleArea({ actions });
	return (Object.keys(APPROVAL_AREAS) as ApprovalArea[]).map((area) => ({
		area,
		label: APPROVAL_AREAS[area],
		actions: ACTION_KEYS.filter((action) => ACTIONS[action].area === area).map(
			(action) => ({ value: action, label: ACTIONS[action].label }),
		),
		locked: picked !== null && picked !== area,
	}));
};

export const toggleAction = ({
	actions,
	action,
}: {
	actions: ApprovalAction[];
	action: ApprovalAction;
}) => {
	if (actions.includes(action)) return actions.filter((a) => a !== action);
	const picked = ruleArea({ actions });
	if (picked !== null && picked !== ACTIONS[action].area) return actions;
	return ACTION_KEYS.filter((a) => a === action || actions.includes(a));
};

/** The `when` fields these actions share, or null when they have none to share. */
export const ruleWhenArea = ({
	actions,
}: {
	actions: ApprovalAction[];
}): WhenKey | null => {
	const areas = new Set(actions.map((action) => ACTIONS[action].when));
	const [area] = areas;
	return areas.size === 1 && area ? area : null;
};

export const whoOnlyCaption = ({ actions }: { actions: ApprovalAction[] }) => {
	const area = ruleArea({ actions });
	if (!area || ruleWhenArea({ actions })) return null;
	const noun =
		(actions.length === 1 && WHO_ONLY_NOUNS[actions[0]]) ||
		WHO_ONLY_NOUNS[area];
	if (noun) {
		return `No conditions for this area yet. The rule applies to every ${noun}.`;
	}
	return "These actions share no conditions, so the rule applies to every request for them.";
};
