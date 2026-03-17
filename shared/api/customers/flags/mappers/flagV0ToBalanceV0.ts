import type { ApiBalance } from "../../cusFeatures/apiBalance";
import type { ApiFlagV0 } from "../apiFlagV0";

export const flagV0ToBalanceV0 = ({
	input,
}: {
	input: ApiFlagV0;
}): ApiBalance => {
	return {
		feature_id: input.feature_id,
		feature: input.feature,
		unlimited: false,
		granted_balance: 0,
		purchased_balance: 0,
		current_balance: 0,
		usage: 0,
		overage_allowed: false,
		max_purchase: null,
		reset: null,
		plan_id: input.plan_id,
		breakdown: [
			{
				id: input.id,
				plan_id: input.plan_id,
				granted_balance: 0,
				purchased_balance: 0,
				current_balance: 0,
				usage: 0,
				overage_allowed: false,
				max_purchase: null,
				reset: null,
				prepaid_quantity: 0,
				expires_at: input.expires_at,
			},
		],
		rollovers: undefined,
	};
};
