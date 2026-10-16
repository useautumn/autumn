import type { ApprovalRule } from "@autumn/shared";

export type RuleMove = "up" | "down" | "top" | "bottom";

/** The full id list after moving `id`; unchanged when it's already at that edge. */
export const moveRule = ({
	ids,
	id,
	move,
}: {
	ids: string[];
	id: string;
	move: RuleMove;
}) => {
	const from = ids.indexOf(id);
	const target = {
		up: Math.max(from - 1, 0),
		down: Math.min(from + 1, ids.length - 1),
		top: 0,
		bottom: ids.length - 1,
	}[move];
	const rest = ids.filter((other) => other !== id);
	return [...rest.slice(0, target), id, ...rest.slice(target)];
};

export const sortRulesByIds = ({
	rules,
	ids,
}: {
	rules: ApprovalRule[];
	ids: string[];
}) => ids.flatMap((id) => rules.find((rule) => rule.id === id) ?? []);
