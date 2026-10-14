import { z } from "zod/v4";

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
