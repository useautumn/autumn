import { z } from "zod/v4";

/** Shared duration vocabulary for grants that expire a fixed time after they
 * are given — reward feature grants and expiring prepaid purchases alike. */
export enum EntitlementDuration {
	Day = "day",
	Week = "week",
	Month = "month",
	Year = "year",
}

export const EntitlementExpirySchema = z.object({
	duration: z.enum(EntitlementDuration),
	length: z.number(),
});

export type EntitlementExpiry = z.infer<typeof EntitlementExpirySchema>;
