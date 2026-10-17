import { z } from "zod/v4";

export const ApprovalsCanResponseSchema = z.object({
	can: z.boolean().meta({
		description:
			"Whether the caller could make some request for this action. Conditional rules can still deny a given request; its preview says so.",
	}),
	reason: z.enum(["scope", "blocked", "none"]).meta({
		description:
			"scope: the caller's scope allows it and no rule rules it out. blocked: an enforced, unconditional block rule denies every request. none: the caller lacks the action's scope.",
	}),
});

export type ApprovalsCanResponse = z.infer<typeof ApprovalsCanResponseSchema>;
