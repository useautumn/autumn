import {
	type BillingBehavior,
	FreeTrialDuration,
	type PlanTiming,
	type ProductItem,
	RedirectModeSchema,
} from "@autumn/shared";
import { z } from "zod/v4";
import type { FormDiscount } from "./utils/discountUtils";

export interface FormCustomLineItem {
	_id: string;
	amount: number | "";
	description: string;
}

export const AttachFormSchema = z.object({
	productId: z.string(),
	prepaidOptions: z.record(z.string(), z.number().nonnegative()),
	items: z.custom<ProductItem[]>().nullable(),
	version: z.number().positive().optional(),
	trialLength: z.number().positive().nullable(),
	trialDuration: z.enum(FreeTrialDuration),
	trialEnabled: z.boolean(),
	trialCardRequired: z.boolean(),
	planSchedule: z.custom<PlanTiming>().nullable(),
	prorationBehavior: z.custom<BillingBehavior>().nullable(),
	redirectMode: RedirectModeSchema,
	newBillingSubscription: z.boolean(),
	resetBillingCycle: z.boolean(),
	discounts: z.custom<FormDiscount[]>(),
	grantFree: z.boolean(),

	noBillingChanges: z.boolean(),
	carryOverBalances: z.boolean(),
	carryOverBalanceFeatureIds: z.array(z.string()),
	carryOverUsages: z.boolean(),
	carryOverUsageFeatureIds: z.array(z.string()),
	customLineItems: z.custom<FormCustomLineItem[]>(),
});

export type AttachForm = z.infer<typeof AttachFormSchema>;
