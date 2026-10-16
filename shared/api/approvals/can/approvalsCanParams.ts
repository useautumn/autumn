import { z } from "zod/v4";
import { ApprovalActionSchema } from "../actions/approvalActions";

export const ApprovalsCanParamsSchema = z.object({
	action: ApprovalActionSchema.meta({
		description: "The action to ask about, named after the route it gates.",
	}),
});

export type ApprovalsCanParams = z.infer<typeof ApprovalsCanParamsSchema>;
