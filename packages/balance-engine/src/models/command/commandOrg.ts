import { OrgConfigSchema } from "@autumn/shared";
import { z } from "zod/v4";
import { nonEmptyStringSchema } from "../common/primitives.js";

/**
 * The org as the log's readers need it, sent by the server with every command. Ids and settings only:
 * the log is kept, replayed and read by every consumer, so nothing secret ever goes on it.
 */
export const commandOrgSchema = z
	.object({
		/** Absent on records logged before they existed. */
		id: nonEmptyStringSchema.optional(),
		slug: nonEmptyStringSchema.optional(),
		config: OrgConfigSchema.pick({
			reverse_deduction_order: true,
			block_overdue_entitlements: true,
			include_past_due: true,
			usage_alerts: true,
			sandbox_usage_alerts: true,
		})
			.partial({ usage_alerts: true, sandbox_usage_alerts: true })
			.strict(),
		/** The Svix apps the org's webhooks deliver through, one per env; absent where none is set up. */
		svix: z
			.object({
				sandbox_app_id: nonEmptyStringSchema.nullable(),
				live_app_id: nonEmptyStringSchema.nullable(),
			})
			.strict()
			.optional(),
	})
	.strict();

export type CommandOrg = z.infer<typeof commandOrgSchema>;
