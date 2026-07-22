import type { ResetCusEntParam } from "@/internal/balances/utils/sql/client.js";
import type { ProcessResetResult } from "./processReset.js";

export const processResetResultToResetCusEntParam = ({
	customerEntitlementId,
	result,
}: {
	customerEntitlementId: string;
	result: ProcessResetResult;
}): ResetCusEntParam => {
	const { updates } = result;

	return {
		cus_ent_id: customerEntitlementId,
		balance: updates.balance,
		additional_balance: updates.additional_balance,
		adjustment: updates.adjustment,
		entities: updates.entities,
		next_reset_at: updates.next_reset_at,
		rollover_insert: result.rolloverInsert?.rows[0] ?? null,
	};
};
