import type { CreateBalanceParamsV0 } from "@autumn/shared";
import type {
	ApprovalCustomerFacts,
	BalanceCreateFacts,
} from "@autumn/shared/api/approvals/evaluate/index.js";

/** Grant credits. `granted_balance` is the internal alias of `included_grant`. */
export const createBalanceParamsToFacts = ({
	customer,
	params,
}: {
	customer: ApprovalCustomerFacts;
	params: Pick<
		CreateBalanceParamsV0,
		| "feature_id"
		| "included_grant"
		| "granted_balance"
		| "unlimited"
		| "expires_at"
		| "reset"
	>;
}): BalanceCreateFacts => ({
	customer,
	feature_id: params.feature_id,
	included_grant: params.included_grant ?? params.granted_balance ?? null,
	unlimited: params.unlimited === true,
	expires_at: params.expires_at ?? null,
	reset: params.reset ? { interval: params.reset.interval } : null,
});
