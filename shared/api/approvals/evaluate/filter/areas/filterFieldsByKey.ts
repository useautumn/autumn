import type { ApprovalFilterKey } from "../../../schemas/filters/approvalFilterShapes";
import type { ApprovalFactsByFilterKey } from "../../facts/approvalFacts";
import type { FilterFields } from "../filterFieldTypes";
import { balanceCreateFields, balanceUpdateFields } from "./balanceFields";
import {
	billingCancelFields,
	billingUncancelFields,
} from "./billingCancelFields";
import { billingChangeFields } from "./billingChangeFields";
import {
	customerChangeFields,
	featureFields,
	invoiceFields,
	planCatalogFields,
	rewardRedeemFields,
} from "./otherAreaFields";

/** How each filter shape is matched and explained, keyed like `APPROVAL_FILTER_SHAPES`. */
export const FILTER_FIELDS_BY_KEY: {
	[Key in ApprovalFilterKey]: FilterFields<ApprovalFactsByFilterKey[Key]>;
} = {
	billing_change: billingChangeFields,
	billing_cancel: billingCancelFields,
	billing_uncancel: billingUncancelFields,
	invoice: invoiceFields,
	balance_create: balanceCreateFields,
	balance_update: balanceUpdateFields,
	reward_redeem: rewardRedeemFields,
	customer_change: customerChangeFields,
	plan: planCatalogFields,
	feature: featureFields,
};
