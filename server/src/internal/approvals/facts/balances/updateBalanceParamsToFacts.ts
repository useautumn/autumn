import type { UpdateBalanceParamsV0 } from "@autumn/shared";
import type {
	ApprovalCustomerFacts,
	BalanceUpdateFacts,
} from "@autumn/shared/api/approvals/evaluate/index.js";

/** Set balance: each value the request sets, null where it leaves one alone. `current_balance` is the legacy alias of `remaining`. */
export const updateBalanceParamsToFacts = ({
	customer,
	params,
}: {
	customer: ApprovalCustomerFacts;
	params: Pick<
		UpdateBalanceParamsV0,
		| "feature_id"
		| "included_grant"
		| "add_to_balance"
		| "remaining"
		| "current_balance"
		| "usage"
	>;
}): BalanceUpdateFacts => ({
	customer,
	feature_id: params.feature_id,
	included_grant: params.included_grant ?? null,
	add_to_balance: params.add_to_balance ?? null,
	remaining: params.remaining ?? params.current_balance ?? null,
	usage: params.usage ?? null,
});
