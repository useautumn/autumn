import {
	type BillingBehavior,
	type CustomizePlanLicense,
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

/** An extra plan included with the primary in the immediate schedule phase. */
const AttachAdditionalPlanSchema = z.object({
	_id: z.string(),
	productId: z.string(),
	prepaidOptions: z.record(z.string(), z.number().nonnegative().optional()),
	items: z.custom<ProductItem[]>().nullable(),
	version: z.number().positive().optional(),
	isCustom: z.boolean(),
	entityId: z.string().nullable().optional(),
});

export type AttachAdditionalPlan = z.infer<typeof AttachAdditionalPlanSchema>;

export const EMPTY_ADDITIONAL_PLAN: Omit<AttachAdditionalPlan, "_id"> = {
	productId: "",
	prepaidOptions: {},
	items: null,
	version: undefined,
	isCustom: false,
	entityId: undefined,
};

export const AttachFormSchema = z.object({
	productId: z.string(),
	additionalPlans: z.array(AttachAdditionalPlanSchema),
	prepaidOptions: z.record(z.string(), z.number().nonnegative().optional()),
	licenseQuantities: z.record(z.string(), z.number().nonnegative().optional()),
	items: z.custom<ProductItem[]>().nullable(),
	addLicenses: z.custom<CustomizePlanLicense[]>().nullable(),
	isCustom: z.boolean(),
	version: z.number().positive().optional(),
	trialLength: z.number().positive().nullable(),
	trialDuration: z.enum(FreeTrialDuration),
	trialEnabled: z.boolean(),
	trialCardRequired: z.boolean(),
	trialOnEnd: z.enum(["bill", "revert"]),
	planSchedule: z.custom<PlanTiming>().nullable(),
	startDate: z.number().nullable(),
	endDate: z.number().nullable(),
	prorationBehavior: z.custom<BillingBehavior>().nullable(),
	redirectMode: RedirectModeSchema,
	newBillingSubscription: z.boolean(),
	resetBillingCycle: z.boolean(),
	discounts: z.custom<FormDiscount[]>(),
	grantFree: z.boolean(),
	currency: z.string().nullable(),

	noBillingChanges: z.boolean(),
	enablePlanImmediately: z.boolean(),
	longLivedCheckout: z.boolean(),
	carryOverBalances: z.boolean(),
	carryOverBalanceFeatureIds: z.array(z.string()),
	carryOverUsages: z.boolean(),
	carryOverUsageFeatureIds: z.array(z.string()),
	customLineItems: z.custom<FormCustomLineItem[]>(),
});

export type AttachForm = z.infer<typeof AttachFormSchema>;
