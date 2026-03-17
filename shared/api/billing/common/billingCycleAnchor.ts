import { z } from "zod/v4";

export const BillingCycleAnchorSchema = z.union([
	z.literal("now"),
	z.number().int(),
]);
