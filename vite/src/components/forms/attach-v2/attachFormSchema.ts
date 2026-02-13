import {
	type BillingBehavior,
	FreeTrialDuration,
	type PlanTiming,
	type ProductItem,
} from "@autumn/shared";
import { z } from "zod/v4";
import type { FormDiscount } from "./utils/discountUtils";

export const AttachFormSchema = z.object({
	productId: z.string(),
	prepaidOptions: z.record(z.string(), z.number().nonnegative()),
	items: z.custom<ProductItem[]>().nullable(),
	version: z.number().positive().optional(),
	trialLength: z.number().positive().nullable(),
	trialDuration: z.enum(FreeTrialDuration),
	trialEnabled: z.boolean(),
	planSchedule: z.custom<PlanTiming>().nullable(),
	billingBehavior: z.custom<BillingBehavior>().nullable(),
	discounts: z.custom<FormDiscount[]>(),
});

export type AttachForm = z.infer<typeof AttachFormSchema>;
