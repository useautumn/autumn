import type { InvoiceUsageEntry, ProductItem } from "@autumn/shared";
import { z } from "zod/v4";
import type { FormDiscount } from "@/components/forms/shared/utils/discountUtils";
import type { FormCustomLineItem } from "../attach-v2/attachFormSchema";

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

const ServicePeriodSchema = z.object({ start: z.number(), end: z.number() });

/** UTC midnights; end is the day the period runs up to. */
export type ServicePeriod = z.infer<typeof ServicePeriodSchema>;

const FormInvoicePlanSchema = z.object({
	_id: z.string(),
	planId: z.string(),
	version: z.number().positive().optional(),
	/** Null keeps catalog pricing. */
	items: z.custom<ProductItem[]>().nullable(),
	isCustom: z.boolean(),
	featureQuantities: FeatureQuantitiesSchema,
	/** Usage-based units for a feature also priced prepaid; its prepaid units stay in featureQuantities. */
	overageQuantities: FeatureQuantitiesSchema,
	featureUsage: FeatureUsageSchema,
	licenses: z.array(FormInvoiceLicenseSchema),
	prorate: z.boolean().optional(),
	/** Null bills the plan at customer level. */
	entityId: z.string().nullable(),
	/** Overrides the invoice's service period for this plan. */
	period: ServicePeriodSchema.nullable(),
	/** Per-line overrides, keyed `featureId:billing_behavior`. */
	featurePeriods: z.record(z.string(), ServicePeriodSchema),
});

export type FormInvoicePlan = z.infer<typeof FormInvoicePlanSchema>;

export const EMPTY_INVOICE_PLAN: Omit<FormInvoicePlan, "_id"> = {
	planId: "",
	version: undefined,
	items: null,
	isCustom: false,
	featureQuantities: {},
	overageQuantities: {},
	featureUsage: {},
	licenses: [],
	prorate: undefined,
	entityId: null,
	period: null,
	featurePeriods: {},
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

export const newInvoicePlan = ({
	entityId = null,
}: {
	entityId?: string | null;
} = {}): FormInvoicePlan => {
	planCounter += 1;
	return {
		...EMPTY_INVOICE_PLAN,
		_id: `plan_${Date.now()}_${planCounter}`,
		entityId,
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
	/** Null issues today. */
	issueDay: z.number().nullable(),
});

export type CreateInvoiceForm = z.infer<typeof CreateInvoiceFormSchema>;
