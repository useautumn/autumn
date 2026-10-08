import { z } from "zod/v4";
import { nonEmptyStringSchema } from "../../../models/common/primitives.js";

export const knownBillingPlanActions = [
	"new",
	"upgrade",
	"downgrade",
	"renew",
	"add_on",
	"one_off",
	"new_version",
	"scheduled_switch",
	"cancel",
	"uncancel",
	"quantity",
	"manual_topup",
	"auto_topup",
	"set_plans",
	"migration",
	"sync",
	"rollback",
	"restore",
	"license",
] as const;

export const billingPlanIntentSchema = z
	.object({
		action: nonEmptyStringSchema,
		fromPlanIds: z.array(nonEmptyStringSchema),
		toPlanIds: z.array(nonEmptyStringSchema),
		migrationId: nonEmptyStringSchema.optional(),
	})
	.loose();

export type KnownBillingPlanAction = (typeof knownBillingPlanActions)[number];
export type BillingPlanIntent = z.infer<typeof billingPlanIntentSchema>;
