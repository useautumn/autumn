import {
	type CustomerPlanChange,
	CustomerPlanChangeSchema,
	type CustomerPlanItemChange,
	CustomerPlanItemChangeSchema,
} from "@autumn/shared/api/billing/common/customerPlanChange.js";

export const PreviewPlanItemChangeSchema = CustomerPlanItemChangeSchema;

export const PreviewPlanChangeSchema = CustomerPlanChangeSchema;

export type PreviewPlanItemChange = CustomerPlanItemChange;

export type PreviewPlanChange = CustomerPlanChange;
