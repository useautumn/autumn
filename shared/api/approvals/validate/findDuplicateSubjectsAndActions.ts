import type { ApprovalAction } from "../actions/approvalActions";
import { type RuleSubject, ruleSubjectKey } from "../schemas/ruleSubject";
import type { ApprovalRuleIssue } from "./types";

const findRepeats = <Item>({
	items,
	keyOf,
}: {
	items: Item[];
	keyOf: (item: Item) => string;
}) => {
	const seen = new Set<string>();
	return items.flatMap((item, index) => {
		const key = keyOf(item);
		if (seen.has(key)) return [index];
		seen.add(key);
		return [];
	});
};

/** Each subject is one stored row, so a repeat would collide on save. */
export const findDuplicateSubjectsAndActions = ({
	subjects,
	actions,
}: {
	subjects: RuleSubject[];
	actions: ApprovalAction[];
}): ApprovalRuleIssue[] => [
	...findRepeats({
		items: subjects,
		keyOf: (subject) => ruleSubjectKey({ subject }),
	}).map((index) => ({
		path: `subjects.${index}`,
		message: "This person or role is already on the rule.",
	})),
	...findRepeats({ items: actions, keyOf: (action) => action }).map(
		(index) => ({
			path: `actions.${index}`,
			message: "This action is already on the rule.",
		}),
	),
];
