import { z } from "zod";

export const OrgConfigSchema = z.object({
  bill_upgrade_immediately: z.boolean().default(true),
  convert_to_charge_automatically: z.boolean().default(false),
  anchor_start_of_month: z.boolean().default(false), // If true, the billing cycle will start on the first day of the month
  cancel_on_past_due: z.boolean().default(false),
  prorate_unused: z.boolean().default(true),
});

export type OrgConfig = z.infer<typeof OrgConfigSchema>;
