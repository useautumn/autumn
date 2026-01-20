import z from "zod/v4";
import { ApiBalanceResetV0Schema } from "../../apiBalanceReset/apiBalanceResetV0";

export const ApiBalanceBreakdownV0Schema = z.object({
	id: z.string().default(""),
	plan_id: z.string().nullable(),

	granted_balance: z.number(),
	purchased_balance: z.number(),
	current_balance: z.number(),
	usage: z.number(),

	overage_allowed: z.boolean(),
	max_purchase: z.number().nullable(),
	reset: ApiBalanceResetV0Schema.nullable(),

	// Extra fields
	prepaid_quantity: z.number().default(0),
	expires_at: z.number().nullable(), // For loose entitlements with expiry
});
export type ApiBalanceBreakdownV0 = z.infer<typeof ApiBalanceBreakdownV0Schema>;
