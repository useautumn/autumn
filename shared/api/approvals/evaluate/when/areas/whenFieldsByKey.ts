import type { WhenKey } from "../../../schemas/when/whenSchemas";
import type { ApprovalFactsByWhen } from "../../facts/approvalFacts";
import type { WhenFields } from "../whenFieldTypes";
import { balanceCreateFields, balanceUpdateFields } from "./balanceFields";
import { billingCancelFields } from "./billingCancelFields";
import { billingChangeFields } from "./billingChangeFields";
import {
	catalogFeatureFields,
	catalogPlanFields,
	customerFields,
	invoiceFields,
	rewardApplyFields,
} from "./otherAreaFields";

/** Field metadata and matchers for each `when` shape (labels from the When fields board). */
export const WHEN_FIELDS_BY_KEY: {
	[Key in WhenKey]: WhenFields<ApprovalFactsByWhen[Key]>;
} = {
	billing_change: billingChangeFields,
	billing_cancel: billingCancelFields,
	invoice: invoiceFields,
	balance_create: balanceCreateFields,
	balance_update: balanceUpdateFields,
	reward_apply: rewardApplyFields,
	customer: customerFields,
	catalog_plan: catalogPlanFields,
	catalog_feature: catalogFeatureFields,
};
