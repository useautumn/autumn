import type { ApprovalViolation } from "./types/approvalVerdict";

const listFormat = new Intl.ListFormat("en", { type: "conjunction" });

/** Used when the deciding rule has no note. */
export const buildDenyMessage = ({
	ruleName,
	violations,
}: {
	ruleName: string;
	violations: ApprovalViolation[];
}) => {
	const labels = [...new Set(violations.map((violation) => violation.label))];
	return `This request is outside "${ruleName}": ${listFormat.format(labels)}.`;
};
