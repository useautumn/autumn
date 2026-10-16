import type { FullCustomer, UpdateBalanceParamsV0 } from "@autumn/shared";
import type { BalanceUpdateFacts } from "@autumn/shared/api/approvals/evaluate/index.js";

/** Set balance: each value the request sets, null where it leaves one alone. */
export const updateBalanceParamsToFacts = ({
	fullCustomer,
	params,
}: {
	fullCustomer: FullCustomer;
	params: Pick<
		UpdateBalanceParamsV0,
		"feature_id" | "included_grant" | "add_to_balance" | "remaining" | "usage"
	>;
}): BalanceUpdateFacts => ({
	customer: fullCustomer,
	feature_id: params.feature_id,
	included_grant: params.included_grant ?? null,
	add_to_balance: params.add_to_balance ?? null,
	remaining: params.remaining ?? null,
	usage: params.usage ?? null,
});
