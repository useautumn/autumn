import { z } from "zod/v4";
import { UnixMsTimestampSchema } from "./unixMsTimestamp";

export const ImmediateBillingCycleAnchorSchema = z.literal("now");

export const BillingCycleAnchorSchema = z.union([
	ImmediateBillingCycleAnchorSchema,
	UnixMsTimestampSchema,
]);
