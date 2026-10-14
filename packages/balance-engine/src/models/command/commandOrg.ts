import { OrgConfigSchema } from "@autumn/shared";
import { z } from "zod/v4";
import { openSchema } from "../common/openSchema.js";
import { nonEmptyStringSchema } from "../common/primitives.js";

export const commandOrgSchema = openSchema({
	name: "commandOrg",
	schema: z.object({
		id: nonEmptyStringSchema.optional(),
		slug: nonEmptyStringSchema.optional(),
		config: OrgConfigSchema.pick({
			reverse_deduction_order: true,
			block_overdue_entitlements: true,
			include_past_due: true,
			usage_alerts: true,
			sandbox_usage_alerts: true,
			persist_free_overage: true,
		})
			.partial({
				usage_alerts: true,
				sandbox_usage_alerts: true,
				persist_free_overage: true,
			})
			.loose(),
		svix: z
			.object({
				sandbox_app_id: nonEmptyStringSchema.nullable(),
				live_app_id: nonEmptyStringSchema.nullable(),
			})
			.loose()
			.optional(),
	}),
});

export type CommandOrg = z.infer<typeof commandOrgSchema>;
