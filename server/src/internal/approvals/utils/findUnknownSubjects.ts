import type { ApprovalRuleIssue, RuleSubject } from "@autumn/shared";

/** Roles and users a rule names must exist, or the rule would apply to whoever takes that id later. */
export const findUnknownSubjects = ({
	subjects,
	roleIds,
	memberUserIds,
}: {
	subjects: RuleSubject[];
	roleIds: Set<string>;
	memberUserIds: Set<string>;
}): ApprovalRuleIssue[] =>
	subjects.flatMap((subject, index) => {
		if (subject.type === "role" && !roleIds.has(subject.role_id))
			return [
				{
					path: `subjects.${index}.role_id`,
					message: `Role "${subject.role_id}" doesn't exist in this organization.`,
				},
			];
		if (subject.type === "user" && !memberUserIds.has(subject.user_id))
			return [
				{
					path: `subjects.${index}.user_id`,
					message: `User "${subject.user_id}" isn't a member of this organization.`,
				},
			];
		return [];
	});
