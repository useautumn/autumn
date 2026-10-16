import type { ResetInterval } from "../../../../models/productModels/intervals/resetInterval";
import type { ApprovalCustomerFacts } from "./customerFacts";

/** Grant credits. Amounts are in the feature's unit. */
export type BalanceCreateFacts = {
	customer: ApprovalCustomerFacts;
	feature_id: string;
	included_grant: number | null;
	unlimited: boolean;
	/** Unix ms. */
	expires_at: number | null;
	reset: { interval: `${ResetInterval}` } | null;
};

/** Set balance. */
export type BalanceUpdateFacts = {
	customer: ApprovalCustomerFacts;
	feature_id: string;
	included_grant: number | null;
	add_to_balance: number | null;
	remaining: number | null;
	usage: number | null;
};
