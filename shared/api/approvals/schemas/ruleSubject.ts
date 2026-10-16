import { z } from "zod/v4";

/** Who a rule applies to. API keys aren't rule subjects in v1. */
export const RuleSubjectSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("everyone") }),
	z.object({ type: z.literal("role"), role: z.string().min(1) }),
	z.object({ type: z.literal("user"), user_id: z.string().min(1) }),
]);

export type RuleSubject = z.infer<typeof RuleSubjectSchema>;
