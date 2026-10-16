import { joinWithAnd } from "../utils/joinWithAnd";
import type { ApprovalViolation } from "./types/approvalViolation";

/** Used when the deciding block rule has no note. */
export const buildDenyMessage = ({
	ruleName,
	violations,
}: {
	ruleName: string;
	violations: ApprovalViolation[];
}) => {
	const labels = [...new Set(violations.map((violation) => violation.label))];
	return labels.length === 0
		? `"${ruleName}" blocks this request.`
		: `"${ruleName}" blocks this request: ${joinWithAnd({ items: labels })}.`;
};
