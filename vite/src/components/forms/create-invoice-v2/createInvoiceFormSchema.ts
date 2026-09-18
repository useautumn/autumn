import type { InvoiceUsageEntry, ProductItem } from "@autumn/shared";
import { z } from "zod/v4";
import type { FormCustomLineItem } from "../attach-v2/attachFormSchema";
import type { FormDiscount } from "../attach-v2/utils/discountUtils";

const FeatureQuantitiesSchema = z.record(
	z.string(),
	z.number().nonnegative().optional(),
);
const FeatureUsageSchema = z.record(
	z.string(),
	z.custom<InvoiceUsageEntry[]>().optional(),
);

const FormInvoiceLicenseSchema = z.object({
	_id: z.string(),
	licensePlanId: z.string(),
	quantity: z.number().nonnegative().optional(),
	featureQuantities: FeatureQuantitiesSchema,
	featureUsage: FeatureUsageSchema,
	prorate: z.boolean().optional(),
});

export type FormInvoiceLicense = z.infer<typeof FormInvoiceLicenseSchema>;

const FormInvoicePlanSchema = z.object({
	_id: z.string(),
	planId: z.string(),
	version: z.number().positive().optional(),
	/** Null keeps catalog pricing. */
	items: z.custom<ProductItem[]>().nullable(),
	isCustom: z.boolean(),
	featureQuantities: FeatureQuantitiesSchema,
	featureUsage: FeatureUsageSchema,
	licenses: z.array(FormInvoiceLicenseSchema),
	prorate: z.boolean().optional(),
});

export type FormInvoicePlan = z.infer<typeof FormInvoicePlanSchema>;

export const EMPTY_INVOICE_PLAN: Omit<FormInvoicePlan, "_id"> = {
	planId: "",
	version: undefined,
	items: null,
	isCustom: false,
	featureQuantities: {},
	featureUsage: {},
	licenses: [],
	prorate: undefined,
};

let licenseCounter = 0;

export const newInvoiceLicense = (
	licensePlanId: string,
): FormInvoiceLicense => {
	licenseCounter += 1;
	return {
		_id: `license_${Date.now()}_${licenseCounter}`,
		licensePlanId,
		quantity: undefined,
		featureQuantities: {},
		featureUsage: {},
		prorate: undefined,
	};
};

let planCounter = 0;

export const newInvoicePlan = (): FormInvoicePlan => {
	planCounter += 1;
	return {
		...EMPTY_INVOICE_PLAN,
		_id: `plan_${Date.now()}_${planCounter}`,
	};
};

export const CreateInvoiceFormSchema = z.object({
	plans: z.array(FormInvoicePlanSchema),
	customLineItems: z.custom<FormCustomLineItem[]>(),
	discounts: z.custom<FormDiscount[]>(),
	invoiceTemplateId: z.string().nullable(),
	netTermsDays: z.number().int().positive().nullable(),
	taxRateId: z.string().nullable(),
	periodStart: z.number().nullable(),
	periodEnd: z.number().nullable(),
});

export type CreateInvoiceForm = z.infer<typeof CreateInvoiceFormSchema>;
