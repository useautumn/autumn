import { OrgConfigSchema } from "@autumn/shared";
import { z } from "zod/v4";

/** The org settings a deduction reads, sent by the server so the log records what a decision was made under. */
export const commandOrgSchema = z
	.object({
		config: OrgConfigSchema.pick({
			reverse_deduction_order: true,
			block_overdue_entitlements: true,
			include_past_due: true,
		}).strict(),
	})
	.strict();

export type CommandOrg = z.infer<typeof commandOrgSchema>;
