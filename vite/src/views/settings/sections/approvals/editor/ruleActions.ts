import {
	ACTIONS,
	type ApprovalAction,
	type ApprovalFilterKey,
} from "../approvalsStub";

// Action ids are route names, so the namespace is the area. Plans and features show under Catalog.
const AREA_LABELS = {
	billing: "Billing",
	invoices: "Invoices",
	balances: "Balances",
	rewards: "Rewards",
	customers: "Customers",
	plans: "Catalog · Plans",
	features: "Catalog · Features",
	api_keys: "API keys",
	migrations: "Migrations",
} as const;

export type ApprovalArea = keyof typeof AREA_LABELS;

export type ActionAreaOption = {
	area: ApprovalArea;
	label: string;
	actions: { value: ApprovalAction; label: string }[];
	locked: boolean;
};

const ACTION_KEYS = Object.keys(ACTIONS) as ApprovalAction[];

const actionArea = (action: ApprovalAction) =>
	action.slice(0, action.indexOf(".")) as ApprovalArea;

// The board words who-only captions per area, or per action where the area also has conditions.
const WHO_ONLY_NOUNS: Partial<Record<ApprovalAction | ApprovalArea, string>> = {
	"customers.get_or_create": "customer creation",
	"rewards.create": "reward creation",
	api_keys: "API key creation",
	migrations: "migration",
};

export const ruleArea = ({ actions }: { actions: ApprovalAction[] }) =>
	actions.length > 0 ? actionArea(actions[0]) : null;

export const areaLabel = (area: ApprovalArea) => AREA_LABELS[area];

/** The areas for the Can picker; once an action is picked, the other areas lock. */
export const actionAreas = ({
	actions,
}: {
	actions: ApprovalAction[];
}): ActionAreaOption[] => {
	const picked = ruleArea({ actions });
	return (Object.keys(AREA_LABELS) as ApprovalArea[]).map((area) => ({
		area,
		label: AREA_LABELS[area],
		actions: ACTION_KEYS.filter((action) => actionArea(action) === area).map(
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
	if (picked !== null && picked !== actionArea(action)) return actions;
	return ACTION_KEYS.filter((a) => a === action || actions.includes(a));
};

/** The filter shape these actions share, or null when they have none to share. */
export const ruleFilterKey = ({
	actions,
}: {
	actions: ApprovalAction[];
}): ApprovalFilterKey | null => {
	const keys = new Set(actions.map((action) => ACTIONS[action].filter));
	const [key] = keys;
	return keys.size === 1 && key ? key : null;
};

export const whoOnlyCaption = ({ actions }: { actions: ApprovalAction[] }) => {
	const area = ruleArea({ actions });
	if (!area || ruleFilterKey({ actions })) return null;
	const noun =
		(actions.length === 1 && WHO_ONLY_NOUNS[actions[0]]) ||
		WHO_ONLY_NOUNS[area];
	if (noun) {
		return `No conditions for this area yet. The rule applies to every ${noun}.`;
	}
	return "These actions share no conditions, so the rule applies to every request for them.";
};
