import { handleInvalidApprovalRuleErrors } from "./handleInvalidApprovalRuleErrors.js";

const issueForKey = (key: string) =>
	key === "position"
		? { path: key, message: "Use approval_rules.reorder to move a rule." }
		: { path: key, message: `"${key}" isn't a rule field.` };

/** The rule schema drops keys it doesn't know, so a misspelled field would otherwise save as a no-op. */
export const handleUnknownRuleFieldErrors = ({
	params,
	fields,
}: {
	params: unknown;
	fields: string[];
}) => {
	const keys =
		typeof params === "object" && params !== null ? Object.keys(params) : [];
	handleInvalidApprovalRuleErrors({
		issues: keys.filter((key) => !fields.includes(key)).map(issueForKey),
	});
};
