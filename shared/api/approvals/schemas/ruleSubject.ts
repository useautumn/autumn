import { z } from "zod/v4";

/** Who a rule applies to. API keys aren't rule subjects in v1. */
export const RuleSubjectSchema = z.discriminatedUnion("type", [
	z.strictObject({ type: z.literal("everyone") }),
	z.strictObject({ type: z.literal("role"), role_id: z.string().min(1) }),
	z.strictObject({ type: z.literal("user"), user_id: z.string().min(1) }),
]);

export type RuleSubject = z.infer<typeof RuleSubjectSchema>;

/** The `(subject_type, subject_id)` a subject is stored under; `*` for everyone. */
export const ruleSubjectKey = ({ subject }: { subject: RuleSubject }) => {
	if (subject.type === "role") return `role:${subject.role_id}`;
	if (subject.type === "user") return `user:${subject.user_id}`;
	return "everyone:*";
};
