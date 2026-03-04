import { z } from "zod/v4";

export enum PurchaseLimitInterval {
	Hour = "hour",
	Day = "day",
	Week = "week",
	Month = "month",
}

export const PurchaseLimitIntervalEnum = z.enum(PurchaseLimitInterval);
